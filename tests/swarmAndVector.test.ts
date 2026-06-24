import { PersistenceFactory } from "../src/core/persistence";
import { MemoryManager } from "../src/core/memory";
import { Config } from "../src/core/config";

jest.mock("../src/core/llmFactory", () => ({
  LLMFactory: {
    getModel: jest.fn().mockReturnValue({
      bindTools: jest.fn().mockReturnThis()
    })
  }
}));

describe("Phase II: Swarm & Semantic RAG Vectors", () => {
  beforeEach(() => {
    Config.ENABLE_EMBEDDINGS = false;
  });

  test("LocalPersistenceAdapter should save and retrieve vectors with cosine similarity", async () => {
    const adapter = PersistenceFactory.getAdapter();
    
    // Save sample vectors
    const v1 = [1.0, 0.0, 0.0];
    const v2 = [0.0, 1.0, 0.0];
    const vQuery = [0.9, 0.1, 0.0]; // Closer to v1 than v2
    
    await adapter.saveVectorIndex("test_cat", "item1", v1, { title: "Item One" });
    await adapter.saveVectorIndex("test_cat", "item2", v2, { title: "Item Two" });
    
    const results = await adapter.queryVectorIndex("test_cat", vQuery, 2);
    
    expect(results.length).toBe(2);
    expect(results[0].key).toBe("item1"); // Closer match must come first
    expect(results[0].score).toBeGreaterThan(0.85);
    expect(results[1].key).toBe("item2"); // Perpendicular match must come second
    expect(results[1].score).toBeLessThan(0.25);
  });

  test("MemoryManager should correctly log session and fallback gracefully when embeddings are disabled", async () => {
    const taskId = "task_" + Date.now();
    await MemoryManager.logSession(taskId, "Test automated trading bot task", "Bot simulated Polymarket live live-run.", ["desktop__take_snapshot_with_grid"]);

    // Recall should fallback to keyword search
    const results = await MemoryManager.recallRecent("Polymarket", 7);
    expect(results).toContain("RELEVANT PAST SESSIONS");
  }, 15000); // Increased timeout for file I/O operations
});
