const Database = require("better-sqlite3");
const path = require("path");
const dbPath = path.resolve("src/workspace/midpointx.db");
console.log("DB path:", dbPath);
try {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t => t.name);
  console.log("Tables:", tables.join(", "));

  const fts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_memories_fts'").get();
  console.log("FTS5 table:", fts ? "EXISTS" : "MISSING");

  const count = db.prepare("SELECT COUNT(*) as n FROM agent_memories").get();
  console.log("Memory rows:", count.n);

  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'am_%'").all().map(t => t.name);
  console.log("FTS triggers:", triggers.length ? triggers.join(", ") : "NONE");

  const sample = db.prepare("SELECT type, key, confidence FROM agent_memories LIMIT 5").all();
  console.log("Sample rows:", JSON.stringify(sample, null, 2));

  // Test FTS search if table exists
  if (fts) {
    try {
      const ftsResult = db.prepare("SELECT rowid FROM agent_memories_fts WHERE agent_memories_fts MATCH ? LIMIT 3").all("user*");
      console.log("FTS search test (MATCH 'user*'):", ftsResult.length, "results");
    } catch(e) {
      console.log("FTS search test: FAILED -", e.message);
    }
  }

  db.close();
  console.log("\nSQLite STATUS: OK");
} catch(e) {
  console.error("SQLite STATUS: FAIL -", e.message);
}
