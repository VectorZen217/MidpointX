import { missionBudgetGateNode } from "../nodes/cognitiveNodes";

jest.mock("../core/missionStore", () => ({
  MissionStore: {
    tick: jest.fn(),
    getMode: jest.fn(),
    getTurnCount: jest.fn(),
    pause: jest.fn(),
  },
}));

jest.mock("../core/swarmBus", () => ({
  SwarmBus: { emit: jest.fn() },
}));

// Mock heavy LangChain deps that cognitiveNodes imports but missionBudgetGateNode does not use
jest.mock("dotenv/config", () => {});
jest.mock("../core/llmFactory", () => ({ LLMFactory: { getModel: jest.fn() } }));
jest.mock("../core/pluginRegistry", () => ({ PluginRegistry: { getActiveTools: jest.fn(() => []), getMDSkills: jest.fn(() => []) } }));
jest.mock("../core/resilience", () => ({ invokeWithResilience: jest.fn() }));
jest.mock("../core/workspaceLoader", () => ({ WorkspaceLoader: { getAgentPersona: jest.fn(() => ""), getUserContext: jest.fn(() => "") } }));
jest.mock("../core/memory", () => ({ MemoryManager: { logSession: jest.fn(), reactivateSkill: jest.fn() } }));
jest.mock("../core/protocol", () => ({ A2AProtocol: { commit: jest.fn((_n: string, v: unknown) => v) } }));
jest.mock("../core/goalTracker", () => ({ GoalTracker: {} }));
jest.mock("../core/environmentProbe", () => ({ EnvironmentProbe: { scan: jest.fn(() => ({})) } }));
jest.mock("../core/prompt", () => ({
  buildReflectPrompt: jest.fn(() => ""),
  buildAnalyzePrompt: jest.fn(() => ""),
  buildLearnPrompt: jest.fn(() => ""),
  buildMemoryContextBlockAsync: jest.fn(async () => ""),
}));
jest.mock("../services/telegramService", () => ({ TelegramService: { init: jest.fn(), sendMessage: jest.fn() } }));

import { MissionStore } from "../core/missionStore";
import { SwarmBus } from "../core/swarmBus";

function makeState(overrides: Record<string, unknown> = {}): any {
  return { threadId: "thread-1", __missionControl: "", ...overrides };
}

beforeEach(() => jest.clearAllMocks());

describe("missionBudgetGateNode", () => {
  it("returns {} and skips tick when threadId is empty", async () => {
    const result = await missionBudgetGateNode(makeState({ threadId: "" }));
    expect(result).toEqual({});
    expect(MissionStore.tick).not.toHaveBeenCalled();
  });

  it("ticks and returns {} for short missions regardless of turn count", async () => {
    (MissionStore.getMode as jest.Mock).mockReturnValue("short");
    (MissionStore.getTurnCount as jest.Mock).mockReturnValue(200);
    const result = await missionBudgetGateNode(makeState());
    expect(MissionStore.tick).toHaveBeenCalledWith("thread-1");
    expect(result).toEqual({});
    expect(MissionStore.pause).not.toHaveBeenCalled();
  });

  it("ticks and returns {} for long-horizon missions under threshold", async () => {
    (MissionStore.getMode as jest.Mock).mockReturnValue("long-horizon");
    (MissionStore.getTurnCount as jest.Mock).mockReturnValue(100);
    const result = await missionBudgetGateNode(makeState());
    expect(MissionStore.tick).toHaveBeenCalledWith("thread-1");
    expect(result).toEqual({});
    expect(MissionStore.pause).not.toHaveBeenCalled();
  });

  it("pauses and returns PAUSE_MISSION at exactly the threshold (140)", async () => {
    (MissionStore.getMode as jest.Mock).mockReturnValue("long-horizon");
    (MissionStore.getTurnCount as jest.Mock).mockReturnValue(140);
    const result = await missionBudgetGateNode(makeState());
    expect(MissionStore.pause).toHaveBeenCalledWith("thread-1");
    expect(SwarmBus.emit).toHaveBeenCalledWith("mission:paused", {
      threadId: "thread-1",
      turns: 140,
      reason: "budget",
    });
    expect(result).toEqual({ __missionControl: "PAUSE_MISSION" });
  });

  it("pauses and returns PAUSE_MISSION above the threshold", async () => {
    (MissionStore.getMode as jest.Mock).mockReturnValue("long-horizon");
    (MissionStore.getTurnCount as jest.Mock).mockReturnValue(155);
    const result = await missionBudgetGateNode(makeState());
    expect(MissionStore.pause).toHaveBeenCalledWith("thread-1");
    expect(result).toEqual({ __missionControl: "PAUSE_MISSION" });
  });
});
