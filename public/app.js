const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const gallery = document.getElementById('gallery');
const cameraSelect = document.getElementById('cameraSelect');
const switchBtn = document.getElementById('switchBtn');
const customerInput = document.getElementById('customerInput');
const caseNumberInput = document.getElementById('caseNumberInput');
const historyList = document.getElementById('historyList');

let stream = null;
let photos = [];

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('de-DE');
}

function renderHistory(items) {
  if (!Array.isArray(items) || items.length === 0) {
    historyList.innerHTML = '<li class="history-empty">Noch keine Uploads.</li>';
    return;
  }

  historyList.innerHTML = items
    .map(
      (item, index) =>
        `<li class="history-item">
          <div class="history-header">
            <div class="history-main">${escapeHtml(item.customer)} / ${escapeHtml(item.caseNumber)}</div>
            <button type="button" class="resend-btn" data-history-index="${index}" ${item.pdfStorageName ? '' : 'disabled'}>
              erneut senden
            </button>
          </div>
          <div class="history-sub">${escapeHtml(item.filename)} · ${item.photoCount} Bild${item.photoCount === 1 ? '' : 'er'}</div>
          <div class="history-time">${escapeHtml(formatTimestamp(item.timestamp))}${item.resentFromId ? ' · erneut gesendet' : ''}</div>
        </li>`
    )
    .join('');
}

async function loadHistory() {
  try {
    const response = await fetch('/api/history');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Historie konnte nicht geladen werden.');
    renderHistory(result.items || []);
  } catch (err) {
    historyList.innerHTML = `<li class="history-empty">${escapeHtml(err.message || 'Historie konnte nicht geladen werden.')}</li>`;
  }
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#c02525' : '#1b6b35';
}

function stopStream() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function loadCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');

  cameraSelect.innerHTML = '';
  videoInputs.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Kamera ${index + 1}`;
    cameraSelect.appendChild(option);
  });
}

async function startCamera(deviceId) {
  try {
    stopStream();
    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await loadCameras();
    setStatus('Kamera bereit.');
  } catch (err) {
    console.error(err);
    setStatus('Kamera konnte nicht gestartet werden.', true);
  }
}

function addPreview(blob) {
  const url = URL.createObjectURL(blob);
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Aufgenommenes Foto';
  gallery.prepend(img);
}

function capturePhoto() {
  if (!stream) {
    setStatus('Bitte zuerst Kamera aktivieren.', true);
    return;
  }

  const canvas = document.createElement('canvas');
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      photos.push(blob);
      addPreview(blob);
      setStatus(`${photos.length} Foto${photos.length === 1 ? '' : 's'} aufgenommen.`);
    },
    'image/jpeg',
    0.92
  );
}

async function sendPhotos() {
  const customer = customerInput.value.trim();
  const caseNumber = caseNumberInput.value.trim();

  if (photos.length === 0) {
    setStatus('Bitte erst mindestens ein Foto aufnehmen.', true);
    return;
  }

  if (!customer || !caseNumber) {
    setStatus('Bitte Kunde und Aktennummer ausfüllen.', true);
    return;
  }

  sendBtn.disabled = true;
  setStatus('Sende PDF ...');

  try {
    const formData = new FormData();
    formData.append('customer', customer);
    formData.append('caseNumber', caseNumber);
    photos.forEach((blob, i) => {
      formData.append('photos', blob, `photo-${i + 1}.jpg`);
    });

    const response = await fetch('/api/send', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Unbekannter Fehler');
    }

    setStatus(result.message || 'Erfolgreich gesendet.');
    photos = [];
    gallery.innerHTML = '';
    await loadHistory();
  } catch (err) {
    setStatus(err.message || 'Fehler beim Senden.', true);
  } finally {
    sendBtn.disabled = false;
  }
}

async function resendFromHistory(historyIndex, buttonEl) {
  buttonEl.disabled = true;
  const originalLabel = buttonEl.textContent;
  buttonEl.textContent = 'sende ...';
  setStatus('Sende Historien-Eintrag erneut ...');

  try {
    const response = await fetch('/api/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ historyIndex })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Erneutes Senden fehlgeschlagen.');
    }

    setStatus(result.message || 'PDF wurde erneut gesendet.');
    await loadHistory();
  } catch (err) {
    setStatus(err.message || 'Erneutes Senden fehlgeschlagen.', true);
    buttonEl.disabled = false;
    buttonEl.textContent = originalLabel;
  }
}

captureBtn.addEventListener('click', capturePhoto);
sendBtn.addEventListener('click', sendPhotos);
switchBtn.addEventListener('click', () => startCamera(cameraSelect.value));
historyList.addEventListener('click', (event) => {
  const button = event.target.closest('.resend-btn');
  if (!button) return;

  const historyIndex = Number(button.dataset.historyIndex);
  if (!Number.isInteger(historyIndex) || historyIndex < 0) {
    setStatus('Ungültiger Historien-Eintrag.', true);
    return;
  }

  resendFromHistory(historyIndex, button);
});

window.addEventListener('beforeunload', stopStream);
startCamera();
loadHistory();
