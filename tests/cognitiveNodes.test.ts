import { silentAssessmentNode, reflectNode, supervisorNode } from "../src/nodes/cognitiveNodes";
import { MidpointXState } from "../src/core/state";
import { invokeWithResilience } from "../src/core/resilience";
import { LLMFactory } from "../src/core/llmFactory";
import { MemoryManager } from "../src/core/memory";
import { A2AProtocol } from "../src/core/protocol";

// ── Mocks ──────────────────────────────────────────────────────────────────
// invokeWithResilience is the single LLM entry point for every cognitive node.
// We control exactly what it returns per-test to drive node branching.
jest.mock("../src/core/resilience", () => ({
  invokeWithResilience: jest.fn(),
}));

// LLMFactory.getModel returns an object that exposes .invoke (for plain calls)
// and .withStructuredOutput (for schema-bound calls). The nodes only chain
// .withStructuredOutput(...).invoke(); the actual invoke is intercepted by the
// mocked invokeWithResilience above, so these can be inert stand-ins.
jest.mock("../src/core/llmFactory", () => ({
  LLMFactory: {
    getModel: jest.fn(() => ({
      invoke: jest.fn(),
      withStructuredOutput: jest.fn().mockReturnThis(),
    })),
  },
}));

jest.mock("../src/core/memory", () => ({
  MemoryManager: {
    recallRecent: jest.fn().mockResolvedValue(""),
    searchArchive: jest.fn().mockResolvedValue(""),
    logSession: jest.fn().mockResolvedValue(undefined),
    logDroppedEventToDLQ: jest.fn().mockResolvedValue(undefined),
  },
}));

// A2AProtocol.commit normally audits to disk and injects an audit hash.
// We bypass persistence and return the raw updates so node output fields
// are directly assertable.
jest.mock("../src/core/protocol", () => ({
  A2AProtocol: {
    commit: jest.fn(async (_node: string, updates: any) => ({ ...updates, latestAuditHash: "test-hash" })),
  },
}));

jest.mock("../src/core/workspaceLoader", () => ({
  WorkspaceLoader: {
    getAgentPersona: jest.fn(() => "TEST_PERSONA"),
    getUserContext: jest.fn(() => "TEST_USER_CONTEXT"),
  },
}));

jest.mock("../src/core/pluginRegistry", () => ({
  PluginRegistry: {
    getMDSkills: jest.fn(() => []),
    getActiveTools: jest.fn(() => []),
  },
}));

jest.mock("../src/core/environmentProbe", () => ({
  EnvironmentProbe: {
    scan: jest.fn().mockResolvedValue({ os: "win32" }),
  },
}));

const mockInvoke = invokeWithResilience as jest.Mock;

// Build a full base state from the Annotation defaults so every field the nodes
// read is present with a sane value.
function baseState(overrides: Partial<typeof MidpointXState.State> = {}): typeof MidpointXState.State {
  const spec = (MidpointXState as any).spec;
  const state: any = {};
  for (const key of Object.keys(spec)) {
    const def = spec[key]?.default;
    state[key] = typeof def === "function" ? def() : undefined;
  }
  return { ...state, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("silentAssessmentNode", () => {
  it("returns assessmentDecision DROP when the LLM drops the event as noise", async () => {
    mockInvoke.mockResolvedValueOnce({ action: "DROP", confidence: 90, worker: "", reasoning: "not relevant" });

    const result: any = await silentAssessmentNode(
      baseState({ proactiveTrigger: { type: "fs", skill: "watcher", data: { path: "x" } } })
    );

    expect(result.assessmentDecision).toBe("DROP");
    expect(result.assessmentReasoning).toBe("not relevant");
    expect(MemoryManager.logDroppedEventToDLQ).toHaveBeenCalled();
  });

  it("returns assessmentDecision ACTION when the LLM is highly confident", async () => {
    mockInvoke.mockResolvedValueOnce({ action: "ACTION", confidence: 95, worker: "researcher", reasoning: "file changed" });

    const result: any = await silentAssessmentNode(
      baseState({ proactiveTrigger: { type: "fs", skill: "watcher", data: { path: "x" } } })
    );

    expect(result.assessmentDecision).toBe("ACTION");
    expect(result.assignedWorker).toBe("researcher");
  });

  it("downgrades ACTION to NOTIFY when confidence is below the 85% threshold", async () => {
    mockInvoke.mockResolvedValueOnce({ action: "ACTION", confidence: 50, worker: "researcher", reasoning: "maybe" });

    const result: any = await silentAssessmentNode(
      baseState({ proactiveTrigger: { type: "fs", skill: "watcher", data: {} } })
    );

    expect(result.assessmentDecision).toBe("NOTIFY");
  });

  it("bypasses (returns empty) when there is no proactive trigger", async () => {
    const result: any = await silentAssessmentNode(baseState({ proactiveTrigger: null }));
    expect(result).toEqual({});
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("reflectNode", () => {
  it("does not throw and populates reflectionTrace / conciseIntent", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: "CONCISE INTENT: summarize the report\nDetailed reflection text here.",
      usage_metadata: { input_tokens: 10, output_tokens: 5 },
    });

    const result: any = await reflectNode(baseState({ userIntent: "Summarize the quarterly report" }));

    expect(result.reflectionTrace).toContain("Detailed reflection text");
    expect(result.conciseIntent).toBe("summarize the report");
  });
});

describe("supervisorNode", () => {
  function swarmResponse(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      strategicPlan: ["step 1", "step 2"],
      rationale: "because",
      assignedWorker: "none",
      subGoal: "do the thing",
      isTaskComplete: false,
      ...overrides,
    };
  }

  it("sets isTaskComplete true when the LLM reports completion", async () => {
    mockInvoke.mockResolvedValueOnce(swarmResponse({ isTaskComplete: true, assignedWorker: "none" }));

    const result: any = await supervisorNode(baseState({ userIntent: "task", conciseIntent: "task" }));

    expect(result.isTaskComplete).toBe(true);
  });

  it("sets activeWorker to the assigned worker role", async () => {
    mockInvoke.mockResolvedValueOnce(swarmResponse({ assignedWorker: "researcher" }));

    const result: any = await supervisorNode(baseState({ userIntent: "task", conciseIntent: "task" }));

    expect(result.activeWorker).toBe("researcher");
    expect(result.strategicPlan).toEqual(["step 1", "step 2"]);
  });
});
