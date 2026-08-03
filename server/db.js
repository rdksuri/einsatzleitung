const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "..", "data", "einsatzleitung.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS state_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const STATE_KEY = "current";

const selectStmt = db.prepare("SELECT value FROM state_store WHERE key = ?");
const upsertStmt = db.prepare(`
  INSERT INTO state_store (key, value, updated_at)
  VALUES (@key, @value, @updatedAt)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

function loadState() {
  const row = selectStmt.get(STATE_KEY);
  return row ? JSON.parse(row.value) : null;
}

function saveState(state) {
  upsertStmt.run({
    key: STATE_KEY,
    value: JSON.stringify(state),
    updatedAt: Date.now(),
  });
}

module.exports = { loadState, saveState };
