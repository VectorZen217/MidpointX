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

  it("queue remains functional after a _writeVectorEntry error", async () => {
    const { adapter } = await makeTempAdapter();
    // Override _writeVectorEntry to simulate a throw on first call only
    let firstCall = true;
    const orig = (adapter as any)._writeVectorEntry.bind(adapter);
    (adapter as any)._writeVectorEntry = async (...args: any[]) => {
      if (firstCall) {
        firstCall = false;
        throw new Error("simulated write failure");
      }
      return orig(...args);
    };

    // First write fails — caller should see rejection
    await expect(adapter.saveVectorIndex("cat", "k1", [1, 0], {})).rejects.toThrow("simulated write failure");

    // Second write must succeed — queue was not permanently broken
    await expect(adapter.saveVectorIndex("cat", "k2", [0, 1], {})).resolves.toBeUndefined();
    const results = await adapter.queryVectorIndex("cat", [1, 0], 10);
    expect(results.some((r) => r.key === "k2")).toBe(true);
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

describe("PersistenceFactory.reset()", () => {
  afterEach(() => {
    PersistenceFactory.reset();
  });

  it("reset() clears the cached instance so getAdapter() creates a new one", () => {
    const a = PersistenceFactory.getAdapter();
    PersistenceFactory.reset();
    const b = PersistenceFactory.getAdapter();
    expect(a).not.toBe(b);
  });

  it("getAdapter() returns the same instance on repeated calls without reset", () => {
    const a = PersistenceFactory.getAdapter();
    const b = PersistenceFactory.getAdapter();
    expect(a).toBe(b);
  });
});

describe("LocalPersistenceAdapter.deleteSkill()", () => {
  it("deleteSkill removes the skill file and subsequent read returns null", async () => {
    const { adapter, dir } = await makeTempAdapter();
    // Write the skill file directly into the adapter's skills subdirectory
    // (saveSkill uses a hardcoded path; deleteSkill uses this.baseDir/skills/)
    const skillsDir = path.join(dir, "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, "delete-test.md"), "# Test Skill Content", "utf-8");

    await adapter.deleteSkill("delete-test");

    // File should no longer exist
    let exists = true;
    try {
      await fs.access(path.join(skillsDir, "delete-test.md"));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it("deleteSkill is idempotent — does not throw when file does not exist", async () => {
    const { adapter } = await makeTempAdapter();
    await expect(adapter.deleteSkill("nonexistent-skill")).resolves.not.toThrow();
  });
});

describe("LocalPersistenceAdapter.listActiveSessions()", () => {
  it("returns sessions stored to disk even after the in-memory map is cleared", async () => {
    const { adapter } = await makeTempAdapter();
    await adapter.saveSession({ taskId: "task-abc", status: "running" });
    // Simulate process restart by clearing in-memory map
    (adapter as any).sessions.clear();
    const sessions = await adapter.listActiveSessions();
    expect(sessions).toContain("task-abc");
  });

  it("returns union of in-memory and disk sessions without duplicates", async () => {
    const { adapter } = await makeTempAdapter();
    await adapter.saveSession({ taskId: "disk-only", status: "done" });
    (adapter as any).sessions.clear();
    // Add an in-memory-only session (never persisted to disk)
    (adapter as any).sessions.set("mem-only", { taskId: "mem-only" });
    const sessions = await adapter.listActiveSessions();
    expect(sessions).toContain("disk-only");
    expect(sessions).toContain("mem-only");
    // No duplicates
    expect(new Set(sessions).size).toBe(sessions.length);
  });
});
