/**
 * Observer scheduling lifecycle tests.
 *
 * The Observer reads scheduled skills from PluginRegistry.getMDSkills() — each
 * MDSkill may carry a `schedule` (cron expression) and/or `watchPath`. On
 * Observer.init() -> sync() it (re)registers a node-cron job per scheduled skill,
 * stopping any pre-existing job for the same skill first (idempotent re-init).
 *
 * These tests mock node-cron, PluginRegistry, and the graph/channel layer so no
 * real cron jobs run and no LLM calls fire when a cron job's callback executes.
 */

// --- node-cron mock ---------------------------------------------------------
const mockStop = jest.fn();
const mockStart = jest.fn();
const mockSchedule = jest.fn((..._args: any[]) => ({ stop: mockStop, start: mockStart }));
const mockValidate = jest.fn((..._args: any[]) => true);

jest.mock("node-cron", () => ({
  __esModule: true,
  default: {
    schedule: mockSchedule,
    validate: mockValidate,
  },
  schedule: mockSchedule,
  validate: mockValidate,
}));

// --- PluginRegistry mock (source of scheduled skills) -----------------------
const mockGetMDSkills = jest.fn(() => [] as any[]);
jest.mock("../src/core/pluginRegistry", () => ({
  PluginRegistry: {
    getMDSkills: () => mockGetMDSkills(),
  },
}));

// --- graph / channel layer: keep cron callbacks from doing real work --------
async function* emptyStream() {
  // no chunks
}
jest.mock("../src/core/graph", () => ({
  MidpointXGraph: { stream: jest.fn(() => emptyStream()) },
}));
jest.mock("../src/core/channelRouter", () => ({
  ChannelRouter: { isUserActive: jest.fn(() => false) },
}));
jest.mock("../src/core/memory", () => ({
  MemoryManager: {
    checkTriggerRateLimit: jest.fn(() => false),
    logSession: jest.fn().mockResolvedValue(undefined),
  },
}));

// Disable the sleep cycle so init() doesn't register an extra unrelated cron.
jest.mock("../src/core/config", () => ({
  Config: {
    ENABLE_SLEEP_CYCLE: false,
    ENABLE_PROACTIVE_SCHEDULER: false,
    SLEEP_CYCLE_CRON: "0 3 * * *",
    PRIMARY_USER_ID: "system",
    MAX_RECURSION_LIMIT: 25,
  },
}));

import { Observer } from "../src/core/observer";

describe("Observer scheduling lifecycle", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSchedule.mockReturnValue({ stop: mockStop, start: mockStart });
    mockGetMDSkills.mockReturnValue([]);
    // Reset any state left from a prior test by syncing with no skills,
    // which de-schedules all known cron jobs.
    await Observer.sync();
    jest.clearAllMocks();
  });

  it("registers a cron job for an enabled skill with a valid schedule", async () => {
    mockGetMDSkills.mockReturnValue([
      { name: "daily-report", description: "d", content: "", schedule: "0 9 * * *" },
    ]);

    await Observer.init();

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledWith("0 9 * * *", expect.any(Function));
  });

  it("does not throw and skips when a cron expression is invalid", async () => {
    // Real node-cron throws inside schedule() on a bad expression; emulate that.
    mockSchedule.mockImplementationOnce(() => {
      throw new Error("Invalid cron expression");
    });

    mockGetMDSkills.mockReturnValue([
      { name: "broken-skill", description: "d", content: "", schedule: "not a cron" },
    ]);

    await expect(Observer.init()).resolves.not.toThrow();

    // schedule() was attempted once, threw, and was swallowed (no job stored).
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("stops the existing job before re-registering on a second init (no duplicates)", async () => {
    mockGetMDSkills.mockReturnValue([
      { name: "daily-report", description: "d", content: "", schedule: "0 9 * * *" },
    ]);

    // First init registers the job.
    await Observer.init();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockStop).not.toHaveBeenCalled();

    // Second init for the same skill must stop the prior job before re-scheduling.
    await Observer.init();

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it("de-schedules a job when the skill is removed on a later sync", async () => {
    mockGetMDSkills.mockReturnValue([
      { name: "daily-report", description: "d", content: "", schedule: "0 9 * * *" },
    ]);
    await Observer.init();
    expect(mockSchedule).toHaveBeenCalledTimes(1);

    // Skill disappears -> sync should stop and forget its cron job.
    mockGetMDSkills.mockReturnValue([]);
    await Observer.sync();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});
