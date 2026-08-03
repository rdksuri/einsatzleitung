# einsatzleitung

Live-Lagebild fuer die Einsatzleitung: Einsatzdaten, Sichtungskategorien (T1-T4),
Bereitstellungsort auf der Karte und ein gemeinsamer Verlauf. Alle verbundenen
Personen sehen Aenderungen sofort ueber WebSockets, nicht per Polling.

## Setup

```
npm install
cp .env.example .env
# EINSATZ_PIN und JWT_SECRET in .env setzen
npm start
```

Danach `http://localhost:3000` oeffnen und mit Kuerzel + PIN anmelden.

## Architektur

- `server/index.js` - Express-App (Login-Route, liefert `public/`), HTTP-Server
- `server/ws-hub.js` - WebSocket-Hub: prueft Token beim Verbindungsaufbau,
  wendet eingehende Mutationen serverseitig auf den Einsatzstatus an und
  broadcastet den neuen Zustand an alle verbundenen Clients
- `server/state.js` - Reine Zustandslogik (Default-Zustand, Mutationen)
- `server/db.js` - Persistenz in SQLite (`better-sqlite3`)
- `server/auth.js` - Login gegen geteiltes PIN, signiert JWT-Tokens
- `public/index.html` - Frontend (Login-Screen + Live-Ansicht)

Der Server ist die alleinige Quelle der Wahrheit: Clients senden nur Absichten
(z.B. "Log-Eintrag hinzufuegen"), nie den kompletten Zustand. Das verhindert,
dass gleichzeitige Aenderungen mehrerer Personen sich gegenseitig ueberschreiben.

## Deployment

### Kostenlos ueber Render (direkt aus diesem Repo)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rdksuri/einsatzleitung)

1. Button klicken, mit GitHub anmelden/verbinden und den Zugriff auf dieses
   Repo bestaetigen.
2. Falls nach einem Branch gefragt wird (oder danach in den Service-Settings):
   `claude/einsatzleitung-backend-plan-g2yq10` waehlen, solange die Aenderungen
   noch nicht auf den Default-Branch gemerged sind.
3. Render liest `render.yaml` und legt einen Web-Service auf dem kostenlosen
   Plan an. Bei `EINSATZ_PIN` einen Wert eintragen (z.B. `6460`), `JWT_SECRET`
   wird automatisch generiert.
4. "Apply" klicken und den Build abwarten (ca. 2-3 Minuten). Die App ist danach
   unter der angezeigten `*.onrender.com`-URL erreichbar.

Hinweise zum kostenlosen Plan:
- Der Service pausiert nach ~15 Minuten Inaktivitaet; der erste Aufruf danach
  dauert durch den Kaltstart ca. 30-60 Sekunden.
- Die SQLite-Datei liegt auf ephemerem Storage: Der Einsatzstand geht bei
  Neustart/Redeploy verloren (auf dem kostenlosen Plan gibt es keine
  persistenten Disks). Fuer echten Dauerbetrieb spaeter auf einen bezahlten
  Plan mit Persistent Disk wechseln oder `DB_PATH` auf einen extern
  angebundenen Speicher zeigen lassen.

### Selbst gehostet

Den Node-Prozess hinter einem Reverse-Proxy (z.B. nginx oder Caddy) mit TLS
betreiben, damit `wss://` genutzt wird. `EINSATZ_PIN` und `JWT_SECRET` als
Umgebungsvariablen setzen, nicht im Repo committen.
