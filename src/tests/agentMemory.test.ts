import * as os from "os";
import * as path from "path";

// Must mock before importing agentMemory so dynamic import is intercepted
jest.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockImplementation(async (text: string) => {
      if (text.includes("typescript")) return [1.0, 0.0, 0.0];
      if (text.includes("python"))    return [0.0, 1.0, 0.0];
      return [0.5, 0.5, 0.0];
    }),
  })),
}));

import { AgentMemory, _resetDbForTesting } from "../core/agentMemory";

function makeTempDbPath(): string {
  return path.join(os.tmpdir(), `mx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

beforeEach(() => {
  _resetDbForTesting(makeTempDbPath());
  process.env.ENABLE_EMBEDDINGS = "false";
});

afterEach(() => {
  _resetDbForTesting();
  delete process.env.ENABLE_EMBEDDINGS;
});

describe("AgentMemory.remember()", () => {
  it("persists a memory to SQLite", async () => {
    const mem = await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    expect(mem.key).toBe("lang");
    expect(mem.value).toBe("TypeScript");
    expect(mem.confidence).toBe(1.0);
  });

  it("sets confidence 0.7 for agent source", async () => {
    const mem = await AgentMemory.remember("pattern", "BFS works well", "learned", "agent");
    expect(mem.confidence).toBe(0.7);
  });

  it("stores no embedding when ENABLE_EMBEDDINGS is false", async () => {
    const mem = await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    expect(mem.embedding).toBeFalsy();
  });

  it("upserts on key conflict", async () => {
    await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    await AgentMemory.remember("lang", "Go", "fact", "user");
    const all = AgentMemory.list();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe("Go");
  });
});

describe("AgentMemory.recall() — LIKE path (embeddings off)", () => {
  it("finds a memory by key substring", async () => {
    await AgentMemory.remember("favorite language", "TypeScript", "preference", "user");
    const results = await AgentMemory.recall("language");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].key).toBe("favorite language");
  });

  it("returns empty array when nothing matches", async () => {
    await AgentMemory.remember("foo", "bar", "fact", "user");
    const results = await AgentMemory.recall("zzznomatch");
    expect(results).toHaveLength(0);
  });

  it("increments access_count on recall", async () => {
    await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    await AgentMemory.recall("lang");
    const [mem] = AgentMemory.list();
    expect(mem.access_count).toBe(1);
  });
});

describe("AgentMemory.recall() — semantic path (embeddings on)", () => {
  beforeEach(() => {
    process.env.ENABLE_EMBEDDINGS = "true";
    process.env.OPENAI_API_KEY = "sk-test-fake";
  });

  it("returns semantically ranked results", async () => {
    await AgentMemory.remember("typescript project", "I use TypeScript daily", "fact", "user");
    await AgentMemory.remember("python project", "I use Python for data science", "fact", "user");

    const results = await AgentMemory.recall("typescript query", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].key).toBe("typescript project");
  });

  it("falls back to LIKE when no embeddings stored", async () => {
    process.env.ENABLE_EMBEDDINGS = "false";
    await AgentMemory.remember("typescript note", "TS is great", "fact", "user");
    process.env.ENABLE_EMBEDDINGS = "true";

    const results = await AgentMemory.recall("typescript", 10);
    expect(results.length).toBeGreaterThan(0);
  });
});
