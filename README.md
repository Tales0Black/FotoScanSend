# FotoScanSend

Webapp, mit der man auf Smartphone/Tablet Fotos aufnehmen und als **eine PDF** automatisch an eine hinterlegte E-Mail-Adresse senden kann.

## Funktionen

- Kamera direkt im Browser (Handy/Tablet)
- Mehrere Fotos aufnehmen
- Fotos werden serverseitig zu einer PDF kombiniert
- Automatische Dateibenennung: `Kunde_Aktennummer_Zeitstempel.pdf`
- PDF wird per SMTP an eine feste Empfänger-Adresse gesendet
- Upload-Historie mit Zeitstempel
- „Erneut senden“-Button pro Historieneintrag

## Voraussetzungen

- Node.js 18+
- SMTP-Zugang (z. B. Gmail Workspace, Office365, Mailgun, SMTP des Hosters)

## Installation

1. Abhängigkeiten installieren:
   - `npm install`
2. Konfiguration anlegen:
   - `.env.example` nach `.env` kopieren
   - SMTP-Daten und Ziel-E-Mail eintragen
3. Starten:
   - `npm start`
4. Im Browser öffnen:
   - `http://localhost:3000`

## Wichtige Hinweise

- Kamera-Zugriff auf Mobilgeräten funktioniert am zuverlässigsten mit HTTPS oder lokalem Netzwerk und vertrauenswürdiger Origin.
- Die Empfängeradresse ist über `TO_EMAIL` fest hinterlegt.
- Optional kann `FROM_EMAIL` gesetzt werden.

## Hosting (kostenloser Start mit Render)

Im Projekt ist bereits [render.yaml](render.yaml) enthalten.

1. Projekt in ein Git-Repository pushen (GitHub/GitLab).
2. Bei Render anmelden und **New +** → **Blueprint** wählen.
3. Repository verbinden und Deployment starten.
4. In Render die sensiblen Werte setzen:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `TO_EMAIL` (hier: `info@agc-schwaben.de`)
   - optional `FROM_EMAIL`
5. App-URL öffnen, Kamera freigeben, testen.

Standard-Empfänger ist bereits auf `info@agc-schwaben.de` gesetzt.

### Wichtiger Betriebs-Hinweis

Die Upload-Historie und gespeicherte PDFs liegen lokal im Ordner `.data/`.
Bei kostenlosen Hosting-Plänen kann lokaler Speicher bei Neustarts verloren gehen.
Für dauerhaft stabile Historie/„erneut senden“ ist später ein persistenter Speicher (z. B. S3/DB) sinnvoll.

## Render-Variablen (direkt eintragen)

In Render unter **Service → Environment** folgende Werte setzen:

- `PORT=3000`
- `SMTP_HOST=<dein SMTP Host>`
- `SMTP_PORT=<Port>`
- `SMTP_SECURE=<true|false>`
- `SMTP_USER=<dein SMTP Benutzer>`
- `SMTP_PASS=<dein SMTP Passwort>`
- `TO_EMAIL=info@agc-schwaben.de`
- `FROM_EMAIL=Scan Bot <scan@example.com>` (optional)

### SMTP-Presets (wenn du noch keinen Wert hast)

- Microsoft 365
   - `SMTP_HOST=smtp.office365.com`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
- Gmail / Google Workspace
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
   - Hinweis: App-Passwort erforderlich (kein normales Login-Passwort)
- IONOS
   - `SMTP_HOST=smtp.ionos.de`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
- Mailgun
   - `SMTP_HOST=smtp.mailgun.org`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`

Nach dem Speichern der Variablen in Render einmal **Manual Deploy → Deploy latest commit** ausführen.
