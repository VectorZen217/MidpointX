import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { cosineSimilarity } from "./mathUtils";
import { Config } from "./config";

export type MemoryType = "fact" | "project" | "preference" | "learned";

export interface Memory {
  id: string;
  type: MemoryType;
  key: string;
  value: string;
  source: string;
  confidence: number;
  created_at: number;
  last_accessed: number;
  access_count: number;
  embedding?: string | null;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.AGENT_MEMORY_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  try { _db.exec("ALTER TABLE agent_memories ADD COLUMN embedding TEXT"); } catch {}
  return _db;
}

export function _resetDbForTesting(customPath?: string): void {
  if (_db) { try { _db.close(); } catch {} _db = null; }
  if (customPath !== undefined) process.env.AGENT_MEMORY_DB_PATH = customPath;
}

async function getEmbedding(text: string): Promise<number[] | null> {
  const enabled = process.env.ENABLE_EMBEDDINGS !== undefined
    ? process.env.ENABLE_EMBEDDINGS === "true"
    : Config.ENABLE_EMBEDDINGS;
  const apiKey = process.env.OPENAI_API_KEY || Config.OPENAI_API_KEY;
  if (!enabled || !apiKey) return null;
  try {
    const { OpenAIEmbeddings } = await import("@langchain/openai");
    const embeddings = new OpenAIEmbeddings({
      apiKey,
      modelName: Config.EMBEDDING_MODEL,
    });
    return await embeddings.embedQuery(text);
  } catch (e) {
    console.warn("⚠️ [AgentMemory] Failed to generate embedding:", e);
    return null;
  }
}

export const AgentMemory = {
  async remember(key: string, value: string, type: MemoryType, source: string): Promise<Memory> {
    const db = getDb();
    const now = Date.now();
    const id = crypto.randomUUID();
    const confidence = source === "user" ? 1.0 : 0.7;

    db.prepare(`
      INSERT INTO agent_memories (id, type, key, value, source, confidence, created_at, last_accessed, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        type = excluded.type,
        source = excluded.source,
        confidence = excluded.confidence,
        last_accessed = excluded.last_accessed
    `).run(id, type, key, value, source, confidence, now, now);

    const memory = db.prepare("SELECT * FROM agent_memories WHERE key = ?").get(key) as Memory;

    const vector = await getEmbedding(`${key}: ${value}`);
    if (vector) {
      db.prepare("UPDATE agent_memories SET embedding = ? WHERE key = ?")
        .run(JSON.stringify(vector), key);
      memory.embedding = JSON.stringify(vector);
    }

    return memory;
  },

  async recallSemantic(query: string, limit = 10): Promise<Memory[]> {
    const db = getDb();
    const queryVector = await getEmbedding(query);
    if (!queryVector) return [];

    const rows = db.prepare(
      "SELECT * FROM agent_memories WHERE embedding IS NOT NULL"
    ).all() as Memory[];

    if (rows.length === 0) return [];

    const now = Date.now();
    const scored = rows
      .map(row => ({
        memory: row,
        score: cosineSimilarity(queryVector, JSON.parse(row.embedding as string))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const updateStmt = db.prepare(
      "UPDATE agent_memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?"
    );
    for (const { memory } of scored) updateStmt.run(now, memory.id);

    return scored.map(s => s.memory);
  },

  async recall(query: string, limit = 10): Promise<Memory[]> {
    const enabled = process.env.ENABLE_EMBEDDINGS !== undefined
      ? process.env.ENABLE_EMBEDDINGS === "true"
      : Config.ENABLE_EMBEDDINGS;
    if (enabled) {
      try {
        const semantic = await this.recallSemantic(query, limit);
        if (semantic.length > 0) return semantic;
      } catch (e) {
        console.warn("⚠️ [AgentMemory] Semantic recall failed, falling back to LIKE:", e);
      }
    }
    const db = getDb();
    const now = Date.now();
    const pattern = `%${query}%`;
    const rows = db.prepare(`
      SELECT * FROM agent_memories
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY last_accessed DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as Memory[];

    if (rows.length > 0) {
      const updateStmt = db.prepare(
        "UPDATE agent_memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?"
      );
      for (const row of rows) updateStmt.run(now, row.id);
    }
    return rows;
  },

  forget(id: string): void {
    getDb().prepare("DELETE FROM agent_memories WHERE id = ?").run(id);
  },

  summarize(limit = 20): Memory[] {
    return getDb()
      .prepare("SELECT * FROM agent_memories ORDER BY access_count DESC, last_accessed DESC LIMIT ?")
      .all(limit) as Memory[];
  },

  list(offset = 0, limit = 50): Memory[] {
    return getDb()
      .prepare("SELECT * FROM agent_memories ORDER BY last_accessed DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Memory[];
  },

  count(): number {
    const row = getDb().prepare("SELECT COUNT(*) as n FROM agent_memories").get() as { n: number } | undefined;
    return row?.n ?? 0;
  }
};
