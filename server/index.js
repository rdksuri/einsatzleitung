require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");

const { login, verifyToken } = require("./auth");
const { createWsHub } = require("./ws-hub");
const { searchAddress } = require("./geocode");

const app = express();
app.use(express.json());

// Simples In-Memory Rate-Limiting gegen Brute-Force auf den PIN.
const loginAttempts = new Map(); // ip -> {count, resetAt}
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + LOGIN_WINDOW_MS;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Zu viele Versuche, bitte kurz warten." });
  }
  next();
}

app.post("/api/login", rateLimitLogin, (req, res) => {
  const { pin, kuerzel } = req.body || {};
  let result;
  try {
    result = login(pin, kuerzel);
  } catch (e) {
    console.error(e.message);
    return res.status(500).json({ error: "Server-Konfigurationsfehler." });
  }
  if (!result) {
    return res.status(401).json({ error: "PIN oder Kürzel ungültig." });
  }
  res.json(result);
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Adress-Autocomplete fuer das Einsatzort-Feld: liefert mehrere Kandidaten
// statt blind den ersten Treffer zu nehmen, damit mehrdeutige Strassennamen
// (z.B. "Klausenstrasse" in mehreren Urner Gemeinden) explizit ausgewaehlt
// werden koennen.
app.get("/api/geocode-search", async (req, res) => {
  if (!verifyToken(req.query.token)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const q = String(req.query.q || "").trim();
  if (q.length < 3) {
    return res.json({ results: [] });
  }
  const results = await searchAddress(q, 5);
  res.json({ results });
});

// TEMPORAER: rohe Diagnose, ob der Server ueberhaupt bis zu Nominatim
// durchkommt (Render blockt manchmal automatisierten Traffic von
// Cloud-IP-Bereichen). Wieder entfernen, sobald das Geocoding zuverlaessig
// laeuft.
app.get("/api/geocode-debug", async (req, res) => {
  if (!verifyToken(req.query.token)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Zurich", {
      headers: { "User-Agent": "Einsatzleitung-App (https://github.com/rdksuri/einsatzleitung)" },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    res.json({ ok: true, status: r.status, bodyPreview: text.slice(0, 300) });
  } catch (e) {
    res.json({ ok: false, errorName: e.name, errorMessage: e.message });
  }
});

app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
createWsHub(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Einsatzleitung-Server läuft auf Port ${PORT}`);
});
