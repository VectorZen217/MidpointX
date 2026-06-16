import * as os from "os";
import * as path from "path";

// Suppress SwarmBus "called before init" warnings in test output
beforeAll(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

import { MissionStore, _resetMissionStoreForTesting } from "../core/missionStore";

function makeTempDbPath(): string {
  return path.join(os.tmpdir(), `mx-ms-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

beforeEach(() => {
  _resetMissionStoreForTesting(makeTempDbPath());
});

afterEach(() => {
  _resetMissionStoreForTesting();
});

describe("MissionStore.register()", () => {
  it("creates a new active mission record", () => {
    MissionStore.register("t1", "Do the thing", "short");
    const missions = MissionStore.listActive();
    expect(missions).toHaveLength(1);
    expect(missions[0].thread_id).toBe("t1");
    expect(missions[0].status).toBe("active");
    expect(missions[0].mode).toBe("short");
    expect(missions[0].turn_count).toBe(0);
  });

  it("is idempotent — re-registering same thread_id preserves original", () => {
    MissionStore.register("t1", "First intent", "short");
    MissionStore.register("t1", "Second intent", "long-horizon");
    const missions = MissionStore.listActive();
    expect(missions).toHaveLength(1);
    expect(missions[0].intent_summary).toBe("First intent");
  });

  it("truncates intent_summary to 200 characters", () => {
    const longIntent = "A".repeat(250);
    MissionStore.register("t2", longIntent, "short");
    const m = MissionStore.get("t2");
    expect(m?.intent_summary.length).toBe(200);
  });
});

describe("MissionStore.tick()", () => {
  it("increments turn_count by 1 each call", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.tick("t1");
    MissionStore.tick("t1");
    expect(MissionStore.getTurnCount("t1")).toBe(2);
  });

  it("is a no-op for unknown thread_id", () => {
    expect(() => MissionStore.tick("nonexistent")).not.toThrow();
  });
});

describe("MissionStore.complete()", () => {
  it("sets status to completed and removes from listActive()", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.complete("t1");
    expect(MissionStore.listActive()).toHaveLength(0);
    const m = MissionStore.listAll().find(r => r.thread_id === "t1");
    expect(m?.status).toBe("completed");
  });
});

describe("MissionStore.fail()", () => {
  it("sets status to failed with the given reason", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.fail("t1", "graph threw");
    const m = MissionStore.listAll().find(r => r.thread_id === "t1");
    expect(m?.status).toBe("failed");
    expect(m?.failure_reason).toBe("graph threw");
  });

  it("removes from listActive()", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.fail("t1", "err");
    expect(MissionStore.listActive()).toHaveLength(0);
  });
});

describe("MissionStore.pause() and resume()", () => {
  it("pause sets status to paused but keeps in listActive()", () => {
    MissionStore.register("t1", "intent", "long-horizon");
    MissionStore.pause("t1");
    const active = MissionStore.listActive();
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("paused");
  });

  it("resume sets status back to active", () => {
    MissionStore.register("t1", "intent", "long-horizon");
    MissionStore.pause("t1");
    MissionStore.resume("t1");
    const m = MissionStore.listActive().find(r => r.thread_id === "t1");
    expect(m?.status).toBe("active");
  });
});

describe("MissionStore.getMode()", () => {
  it("returns mode for registered thread", () => {
    MissionStore.register("t1", "intent", "long-horizon");
    expect(MissionStore.getMode("t1")).toBe("long-horizon");
  });

  it("returns null for unknown thread", () => {
    expect(MissionStore.getMode("ghost")).toBeNull();
  });
});

describe("MissionStore.get()", () => {
  it("returns the full record", () => {
    MissionStore.register("t1", "my intent", "short");
    const m = MissionStore.get("t1");
    expect(m).not.toBeNull();
    expect(m?.thread_id).toBe("t1");
    expect(m?.intent_summary).toBe("my intent");
  });

  it("returns null for unknown thread", () => {
    expect(MissionStore.get("ghost")).toBeNull();
  });
});

describe("MissionStore.listAll()", () => {
  it("includes completed and failed missions", () => {
    MissionStore.register("t1", "a", "short");
    MissionStore.register("t2", "b", "short");
    MissionStore.complete("t1");
    MissionStore.fail("t2", "err");
    const all = MissionStore.listAll();
    expect(all).toHaveLength(2);
  });
});
