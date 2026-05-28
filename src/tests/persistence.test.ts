import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { LocalPersistenceAdapter, PersistenceFactory } from "../core/persistence";

async function makeTempAdapter(): Promise<{ adapter: LocalPersistenceAdapter; dir: string }> {
  const dir = path.join(os.tmpdir(), `mx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  const adapter = new LocalPersistenceAdapter(dir);
  return { adapter, dir };
}

describe("LocalPersistenceAdapter.saveVectorIndex — concurrency", () => {
  it("does not lose writes when two calls overlap", async () => {
    const { adapter } = await makeTempAdapter();
    await Promise.all([
      adapter.saveVectorIndex("cat", "k1", [1, 0], { label: "k1" }),
      adapter.saveVectorIndex("cat", "k2", [0, 1], { label: "k2" }),
    ]);
    const results = await adapter.queryVectorIndex("cat", [1, 0], 10);
    expect(results.map((r) => r.key).sort()).toEqual(["k1", "k2"]);
  });

  it("preserves existing entries when adding a new one", async () => {
    const { adapter } = await makeTempAdapter();
    await adapter.saveVectorIndex("cat", "a", [1, 0], {});
    await adapter.saveVectorIndex("cat", "b", [0, 1], {});
    await adapter.saveVectorIndex("cat", "c", [1, 1], {});
    const results = await adapter.queryVectorIndex("cat", [1, 0], 10);
    expect(results).toHaveLength(3);
  });
});

describe("LocalPersistenceAdapter constructor base directory", () => {
  it("accepts a custom base directory", async () => {
    const { adapter, dir } = await makeTempAdapter();
    await adapter.appendLog("test", "key", "content");
    const content = await adapter.readLogs("test", "key");
    expect(content).toBe("content");
    const entries = await fs.readdir(path.join(dir, "test"));
    expect(entries).toContain("key.md");
  });
});
