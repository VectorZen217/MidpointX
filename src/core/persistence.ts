import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";
import { Config } from "./config";

/**
 * PersistenceAdapter: Abstract interface for all MidpointX data storage.
 * Local filesystem (default) or SQLite for production-grade single-file persistence.
 */
export interface PersistenceAdapter {
  // Memory Logs
  appendLog(category: string, key: string, content: string): Promise<void>;
  readLogs(category: string, key: string): Promise<string>;
  listLogs(category: string): Promise<string[]>;

  // Skill/Theorem Storage
  saveSkill(name: string, content: string): Promise<void>;
  readSkill(name: string): Promise<string | null>;
  listSkills(): Promise<string[]>;

  // Metrics/Stats
  saveStats(key: string, data: any): Promise<void>;
  readStats(key: string): Promise<any>;

  // Audit Ledger
  appendAudit(entry: string): Promise<void>;
  getLatestAuditHash(): Promise<string>;

  // Session Management (Phase 6)
  saveSession(session: any): Promise<void>;
  getSession(taskId: string): Promise<any | null>;
  listActiveSessions(): Promise<string[]>;

  // Advanced Operations (Cleanup/Consolidation)
  searchLogs(category: string, queryTerms: string[]): Promise<Array<{ date: string; entry: string; score: number }>>;
  deleteLog(category: string, key: string): Promise<void>;
  moveSkill(source: string, destination: string): Promise<void>;
  listLogFiles(category: string): Promise<string[]>;

  // Hybrid Vector Memory (Phase 2)
  saveVectorIndex(category: string, key: string, vector: number[], metadata: any): Promise<void>;
  queryVectorIndex(category: string, vector: number[], limit: number): Promise<Array<{ key: string; score: number; metadata: any }>>;
}

/**
 * Local implementation using the Node.js filesystem.
 */
export class LocalPersistenceAdapter implements PersistenceAdapter {
  private baseDir: string;
  private sessions: Map<string, any> = new Map();
  private vectorWriteQueue: Promise<void> = Promise.resolve();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(__dirname, "../../src/workspace");
  }

  async appendLog(category: string, key: string, content: string): Promise<void> {
    const dir = path.join(this.baseDir, category);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, `${key}.md`), content, "utf-8");
  }

  async readLogs(category: string, key: string): Promise<string> {
    const filePath = path.join(this.baseDir, category, `${key}.md`);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  async listLogs(category: string): Promise<string[]> {
    const dir = path.join(this.baseDir, category);
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  async saveSkill(name: string, content: string): Promise<void> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    await fs.writeFile(path.join(skillDir, `${name}.md`), content, "utf-8");
  }

  async readSkill(name: string): Promise<string | null> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    try {
      return await fs.readFile(path.join(skillDir, `${name}.md`), "utf-8");
    } catch {
      return null;
    }
  }

  async listSkills(): Promise<string[]> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    try {
      return await fs.readdir(skillDir);
    } catch {
      return [];
    }
  }

  async saveStats(key: string, data: any): Promise<void> {
    const statsPath = path.resolve(__dirname, `../../src/plugins/skills/${key}.json`);
    await fs.writeFile(statsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async readStats(key: string): Promise<any> {
    const statsPath = path.resolve(__dirname, `../../src/plugins/skills/${key}.json`);
    try {
      const data = await fs.readFile(statsPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async appendAudit(entry: string): Promise<void> {
    const auditDir = path.join(this.baseDir, "audit");
    if (!existsSync(auditDir)) await fs.mkdir(auditDir, { recursive: true });
    await fs.appendFile(path.join(auditDir, "a2a_handshake.jsonl"), entry + "\n");
  }

  async getLatestAuditHash(): Promise<string> {
    const auditDir = path.join(this.baseDir, "audit");
    const logPath = path.join(auditDir, "a2a_handshake.jsonl");
    if (!existsSync(logPath)) return "0";

    const content = (await fs.readFile(logPath, "utf-8")).trim().split("\n");
    if (content.length === 0) return "0";

    try {
      const lastEntry = JSON.parse(content[content.length - 1]);
      return lastEntry.hash || "0";
    } catch {
      return "CORRUPT";
    }
  }

  async searchLogs(category: string, queryTerms: string[]): Promise<Array<{ date: string; entry: string; score: number }>> {
    const dir = path.join(this.baseDir, category);
    if (!existsSync(dir)) return [];

    const files = await fs.readdir(dir);
    const results: Array<{ date: string; entry: string; score: number }> = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const content = await fs.readFile(path.join(dir, file), "utf-8");
      const date = file.replace(".md", "");

      // Split by entry blocks (## [...] headers)
      const entries = content.split(/\n(?=## \[)|^(?=## \[)/m).filter(e => e.trim().length > 10);

      for (const entry of entries) {
        const entryLower = entry.toLowerCase();
        const score = queryTerms.reduce((acc, term) => acc + (entryLower.includes(term) ? 1 : 0), 0);
        if (score > 0) {
          results.push({ date, entry: entry.trim(), score });
        }
      }
    }
    return results;
  }

  async deleteLog(category: string, key: string): Promise<void> {
    const filePath = path.join(this.baseDir, category, `${key}.md`);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  }

  async moveSkill(source: string, destination: string): Promise<void> {
    const skillDir = path.resolve(__dirname, "../../src/plugins/skills");
    const srcPath = path.join(skillDir, source);
    const destPath = path.join(skillDir, destination);
    if (existsSync(srcPath)) {
      await fs.rename(srcPath, destPath);
    }
  }

  async listLogFiles(category: string): Promise<string[]> {
    const dir = path.join(this.baseDir, category);
    if (!existsSync(dir)) return [];
    return await fs.readdir(dir);
  }

  async saveSession(session: any): Promise<void> {
    this.sessions.set(session.taskId, session);
    const sessionDir = path.join(this.baseDir, "sessions");
    if (!existsSync(sessionDir)) await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, `${session.taskId}.json`), JSON.stringify(session, null, 2));
  }

  async getSession(taskId: string): Promise<any | null> {
    const session = this.sessions.get(taskId);
    if (session) return session;

    const sessionFile = path.join(this.baseDir, "sessions", `${taskId}.json`);
    if (existsSync(sessionFile)) {
      const data = await fs.readFile(sessionFile, "utf-8");
      return JSON.parse(data);
    }
    return null;
  }

  async listActiveSessions(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  async saveVectorIndex(category: string, key: string, vector: number[], metadata: any): Promise<void> {
    this.vectorWriteQueue = this.vectorWriteQueue.then(() =>
      this._writeVectorEntry(category, key, vector, metadata)
    );
    return this.vectorWriteQueue;
  }

  private async _writeVectorEntry(category: string, key: string, vector: number[], metadata: any): Promise<void> {
    const filePath = path.join(this.baseDir, "vector_store.json");
    let store: Record<string, Array<{ key: string; vector: number[]; metadata: any }>> = {};

    if (existsSync(filePath)) {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        store = JSON.parse(raw);
      } catch (e) {
        console.warn("⚠️ [Persistence] Failed to parse vector_store.json, resetting.", e);
      }
    }

    if (!store[category]) store[category] = [];
    store[category] = store[category].filter((item) => item.key !== key);
    store[category].push({ key, vector, metadata });

    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
  }

  async queryVectorIndex(category: string, vector: number[], limit: number): Promise<Array<{ key: string; score: number; metadata: any }>> {
    const filePath = path.join(this.baseDir, "vector_store.json");
    if (!existsSync(filePath)) return [];
    
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const store = JSON.parse(raw);
      const items = store[category] || [];
      
      const results = items.map((item: any) => {
        const score = cosineSimilarity(vector, item.vector);
        return { key: item.key, score, metadata: item.metadata };
      });
      
      return results.sort((a: any, b: any) => b.score - a.score).slice(0, limit);
    } catch (e) {
      console.error("❌ [Persistence] Failed to query vector store:", e);
      return [];
    }
  }
}

/**
 * SQLitePersistenceAdapter: Production-grade local persistence using better-sqlite3.
 * Zero network dependencies — fully self-contained in a single .db file.
 * Install: npm install better-sqlite3 && npm install -D @types/better-sqlite3
 */
export class SQLitePersistenceAdapter implements PersistenceAdapter {
  private db: any; // typed as any until better-sqlite3 types are installed
  private dbPath: string;

  constructor(dbPath = path.resolve(__dirname, "../../src/workspace/midpointx.db")) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!existsSync(dir)) {
      require("fs").mkdirSync(dir, { recursive: true });
    }
    // Lazy require so the build doesn't fail if better-sqlite3 isn't installed yet
    const Database = require("better-sqlite3");
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skills (
        name TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry TEXT NOT NULL,
        hash TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        task_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vector_store (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        vector TEXT NOT NULL,
        metadata TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);
    console.log(`🗄️ [SQLite] Initialized database at ${dbPath}`);
  }

  async appendLog(category: string, key: string, content: string): Promise<void> {
    const id = `${category}_${key}`;
    const existing = this.db.prepare("SELECT content FROM logs WHERE id = ?").get(id);
    const newContent = (existing?.content || "") + content;
    this.db.prepare("INSERT OR REPLACE INTO logs (id, content, updated_at) VALUES (?, ?, ?)").run(id, newContent, new Date().toISOString());
  }

  async readLogs(category: string, key: string): Promise<string> {
    const row = this.db.prepare("SELECT content FROM logs WHERE id = ?").get(`${category}_${key}`);
    return row?.content || "";
  }

  async listLogs(category: string): Promise<string[]> {
    const rows = this.db.prepare("SELECT id FROM logs WHERE id LIKE ?").all(`${category}_%`);
    return rows.map((r: any) => r.id.replace(`${category}_`, ""));
  }

  async saveSkill(name: string, content: string): Promise<void> {
    this.db.prepare("INSERT OR REPLACE INTO skills (name, content, updated_at) VALUES (?, ?, ?)").run(name, content, new Date().toISOString());
  }

  async readSkill(name: string): Promise<string | null> {
    const row = this.db.prepare("SELECT content FROM skills WHERE name = ?").get(name);
    return row?.content || null;
  }

  async listSkills(): Promise<string[]> {
    return this.db.prepare("SELECT name FROM skills").all().map((r: any) => r.name);
  }

  async saveStats(key: string, data: any): Promise<void> {
    this.db.prepare("INSERT OR REPLACE INTO stats (key, data) VALUES (?, ?)").run(key, JSON.stringify(data));
  }

  async readStats(key: string): Promise<any> {
    const row = this.db.prepare("SELECT data FROM stats WHERE key = ?").get(key);
    return row ? JSON.parse(row.data) : {};
  }

  async appendAudit(entry: string): Promise<void> {
    const parsed = JSON.parse(entry);
    this.db.prepare("INSERT INTO audit (entry, hash, timestamp) VALUES (?, ?, ?)").run(entry, parsed.hash || null, parsed.timestamp || new Date().toISOString());
  }

  async getLatestAuditHash(): Promise<string> {
    const row = this.db.prepare("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").get();
    return row?.hash || "0";
  }

  async saveSession(session: any): Promise<void> {
    this.db.prepare("INSERT OR REPLACE INTO sessions (task_id, data, updated_at) VALUES (?, ?, ?)").run(session.taskId, JSON.stringify(session), new Date().toISOString());
  }

  async getSession(taskId: string): Promise<any | null> {
    const row = this.db.prepare("SELECT data FROM sessions WHERE task_id = ?").get(taskId);
    return row ? JSON.parse(row.data) : null;
  }

  async listActiveSessions(): Promise<string[]> {
    return this.db.prepare("SELECT task_id FROM sessions").all().map((r: any) => r.task_id);
  }

  async searchLogs(category: string, queryTerms: string[]): Promise<Array<{ date: string; entry: string; score: number }>> {
    const rows = this.db.prepare("SELECT id, content FROM logs WHERE id LIKE ?").all(`${category}_%`);
    const results: Array<{ date: string; entry: string; score: number }> = [];
    for (const row of rows) {
      const date = row.id.replace(`${category}_`, "");
      const entries = row.content.split(/\n(?=## \[)|^(?=## \[)/m).filter((e: string) => e.trim().length > 10);
      for (const entry of entries) {
        const lower = entry.toLowerCase();
        const score = queryTerms.reduce((acc: number, term: string) => acc + (lower.includes(term) ? 1 : 0), 0);
        if (score > 0) results.push({ date, entry: entry.trim(), score });
      }
    }
    return results;
  }

  async deleteLog(category: string, key: string): Promise<void> {
    this.db.prepare("DELETE FROM logs WHERE id = ?").run(`${category}_${key}`);
  }

  async moveSkill(source: string, destination: string): Promise<void> {
    const skill = await this.readSkill(source);
    if (skill) {
      await this.saveSkill(destination, skill);
      this.db.prepare("DELETE FROM skills WHERE name = ?").run(source);
    }
  }

  async listLogFiles(category: string): Promise<string[]> {
    return this.listLogs(category);
  }

  async saveVectorIndex(category: string, key: string, vector: number[], metadata: any): Promise<void> {
    const id = `${category}_${key}`;
    this.db.prepare("INSERT OR REPLACE INTO vector_store (id, category, key, vector, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?)").run(id, category, key, JSON.stringify(vector), JSON.stringify(metadata), new Date().toISOString());
  }

  async queryVectorIndex(category: string, vector: number[], limit: number): Promise<Array<{ key: string; score: number; metadata: any }>> {
        const rows = this.db.prepare("SELECT key, vector, metadata FROM vector_store WHERE category = ?").all(category);
    const results = rows.map((row: any) => ({
      key: row.key,
      score: cosineSimilarity(vector, JSON.parse(row.vector)),
      metadata: JSON.parse(row.metadata)
    }));
    return results.sort((a: any, b: any) => b.score - a.score).slice(0, limit);
  }
}

/**
 * Factory for retrieving the active persistence adapter.
 */
export class PersistenceFactory {
  private static instance: PersistenceAdapter | null = null;

  static getAdapter(): PersistenceAdapter {
    if (this.instance) return this.instance;

    if (Config.PERSISTENCE_ADAPTER === "sqlite") {
      try {
        require.resolve("better-sqlite3");
      } catch {
        throw new Error(
          "[PersistenceFactory] better-sqlite3 is not installed.\n" +
          "  Run: npm install better-sqlite3\n" +
          "  Or set PERSISTENCE_ADAPTER=local in .env to use the filesystem adapter."
        );
      }
      console.log("\u{1F5C4}\uFE0F [Persistence] Initializing SQLitePersistenceAdapter...");
      this.instance = new SQLitePersistenceAdapter();
    } else {
      console.log("\u{1F4C2} [Persistence] Initializing LocalPersistenceAdapter...");
      this.instance = new LocalPersistenceAdapter();
    }

    return this.instance;
  }
}

/**
 * Cosine Similarity Math Helper (100% native vector operations)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
