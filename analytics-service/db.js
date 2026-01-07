import sqlite3 from "sqlite3";
export const db = new sqlite3.Database("analytics.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_messages INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`INSERT OR IGNORE INTO counters (id, total_messages) VALUES (1, 0)`);
});
