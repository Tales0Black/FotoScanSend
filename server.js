require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const DEFAULT_TO_EMAIL = 'info@agc-schwaben.de';
const DATA_DIR = path.join(__dirname, '.data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const HISTORY_FILE = path.join(DATA_DIR, 'upload-history.json');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: 10 * 1024 * 1024
  }
});

function toBool(value) {
  return String(value).toLowerCase() === 'true';
}

function sanitizePart(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9äöüÄÖÜß\-_]/g, '');

  return cleaned || fallback;
}

function createFilename(customer, caseNumber, timestamp) {
  const customerPart = sanitizePart(customer, 'kunde-unbekannt');
  const casePart = sanitizePart(caseNumber, 'akte-unbekannt');
  return `${customerPart}_${casePart}_${timestamp}.pdf`;
}

async function ensureHistoryStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PDF_DIR, { recursive: true });
  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, '[]', 'utf8');
  }
}

async function readHistory() {
  await ensureHistoryStore();
  const raw = await fs.readFile(HISTORY_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function appendHistory(entry) {
  const history = await readHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, 200);
  await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
}

function createHistoryId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}`;
}

async function savePdfBuffer(pdfBuffer, historyId) {
  await ensureHistoryStore();
  const storageName = `${historyId}.pdf`;
  const storagePath = path.join(PDF_DIR, storageName);
  await fs.writeFile(storagePath, pdfBuffer);
  return storageName;
}

async function sendPdfMail({ customer, caseNumber, photoCount, filename, pdfBuffer }) {
  const transporter = buildTransporter();
  const recipientEmail = getRecipientEmail();
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: recipientEmail,
    subject: `Foto-Scan ${customer} / ${caseNumber} (${photoCount} Bild${photoCount === 1 ? '' : 'er'})`,
    text: `Automatisch gesendeter Foto-Scan\nKunde: ${customer}\nAktennummer: ${caseNumber}\nAnzahl Bilder: ${photoCount}`,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });
}

function buildTransporter() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: toBool(process.env.SMTP_SECURE),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function getRecipientEmail() {
  return process.env.TO_EMAIL || DEFAULT_TO_EMAIL;
}

async function imagesToPdf(files) {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const mime = file.mimetype;
    let image;

    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      image = await pdfDoc.embedJpg(file.buffer);
    } else if (mime === 'image/png') {
      image = await pdfDoc.embedPng(file.buffer);
    } else {
      throw new Error(`Nicht unterstütztes Bildformat: ${mime}`);
    }

    const imgWidth = image.width;
    const imgHeight = image.height;

    const page = pdfDoc.addPage([imgWidth, imgHeight]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: imgWidth,
      height: imgHeight
    });
  }

  return Buffer.from(await pdfDoc.save());
}

app.use(express.static('public'));
app.use(express.json());

app.get('/health', (req, res) => {
  return res.status(200).json({ ok: true, service: 'FotoScanSend' });
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await readHistory();
    return res.json({ items: history });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Upload-Historie konnte nicht geladen werden.' });
  }
});

app.post('/api/resend', async (req, res) => {
  try {
    const historyIndex = Number(req.body?.historyIndex);
    if (!Number.isInteger(historyIndex) || historyIndex < 0) {
      return res.status(400).json({ message: 'Ungültiger Historien-Eintrag.' });
    }

    const history = await readHistory();
    const entry = history[historyIndex];

    if (!entry) {
      return res.status(404).json({ message: 'Historien-Eintrag nicht gefunden.' });
    }

    if (!entry.pdfStorageName) {
      return res.status(400).json({ message: 'Dieser Eintrag kann nicht erneut gesendet werden.' });
    }

    const storedPdfPath = path.join(PDF_DIR, entry.pdfStorageName);
    const pdfBuffer = await fs.readFile(storedPdfPath);

    await sendPdfMail({
      customer: entry.customer,
      caseNumber: entry.caseNumber,
      photoCount: entry.photoCount,
      filename: entry.filename,
      pdfBuffer
    });

    const resendEntry = {
      id: createHistoryId(),
      timestamp: new Date().toISOString(),
      filename: entry.filename,
      customer: entry.customer,
      caseNumber: entry.caseNumber,
      photoCount: entry.photoCount,
      toEmail: getRecipientEmail(),
      pdfStorageName: entry.pdfStorageName,
      resentFromId: entry.id || null
    };

    await appendHistory(resendEntry);
    return res.json({ message: 'PDF wurde erneut gesendet.', item: resendEntry });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erneutes Senden fehlgeschlagen.' });
  }
});

app.post('/api/send', upload.array('photos', 20), async (req, res) => {
  try {
    const files = req.files || [];
    const customer = String(req.body.customer || '').trim();
    const caseNumber = String(req.body.caseNumber || '').trim();

    if (files.length === 0) {
      return res.status(400).json({ message: 'Keine Fotos empfangen.' });
    }

    if (!customer || !caseNumber) {
      return res.status(400).json({ message: 'Bitte Kunde und Aktennummer angeben.' });
    }

    const pdfBuffer = await imagesToPdf(files);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const historyId = createHistoryId();
    const filename = createFilename(customer, caseNumber, timestamp);
    const pdfStorageName = await savePdfBuffer(pdfBuffer, historyId);

    await sendPdfMail({
      customer,
      caseNumber,
      photoCount: files.length,
      filename,
      pdfBuffer
    });

    const historyEntry = {
      id: historyId,
      timestamp: now.toISOString(),
      filename,
      customer,
      caseNumber,
      photoCount: files.length,
      toEmail: getRecipientEmail(),
      pdfStorageName
    };

    await appendHistory(historyEntry);

    return res.json({ message: 'PDF wurde erfolgreich gesendet.', item: historyEntry });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Versand fehlgeschlagen. Konfiguration prüfen.' });
  }
});

app.listen(port, () => {
  console.log(`FotoScanSend läuft auf http://localhost:${port}`);
});
