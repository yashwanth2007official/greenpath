const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'greenpath.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS trip_intents (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    origin_lat REAL NOT NULL,
    origin_lng REAL NOT NULL,
    dest_lat REAL NOT NULL,
    dest_lng REAL NOT NULL,
    route_geometry TEXT NOT NULL,
    distance_km REAL NOT NULL,
    duration_min REAL NOT NULL,
    depart_earliest TEXT NOT NULL,
    depart_latest TEXT NOT NULL,
    seats_available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
