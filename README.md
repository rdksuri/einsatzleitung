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
- `public/einsatzleitung.html` - Frontend (Login-Screen + Live-Ansicht)

Der Server ist die alleinige Quelle der Wahrheit: Clients senden nur Absichten
(z.B. "Log-Eintrag hinzufuegen"), nie den kompletten Zustand. Das verhindert,
dass gleichzeitige Aenderungen mehrerer Personen sich gegenseitig ueberschreiben.

## Deployment

Fuer den Produktivbetrieb den Node-Prozess hinter einem Reverse-Proxy
(z.B. nginx oder Caddy) mit TLS betreiben, damit `wss://` genutzt wird.
`EINSATZ_PIN` und `JWT_SECRET` als Umgebungsvariablen setzen, nicht im Repo
committen.
