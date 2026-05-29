import { ChannelRouter } from "../core/channelRouter";
import { MidpointXGraph } from "../core/graph";
import { MemoryManager } from "../core/memory";

// Helper to create an async generator for mocking stream
async function* mockStream(chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

jest.mock("../core/graph", () => ({
  MidpointXGraph: {
    stream: jest.fn()
  }
}));

jest.mock("../core/memory", () => ({
  MemoryManager: {
    logSession: jest.fn().mockResolvedValue(undefined)
  }
}));

describe("ChannelRouter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should route messages to the graph and return the outcome", async () => {
    const payload = {
      userId: "user-123",
      intent: "Summarize this file",
      channel: "telegram" as const,
      executionMode: "api"
    };

    (MidpointXGraph.stream as jest.Mock).mockReturnValue(mockStream([
      { ReflectionActor: { totalInputTokens: 10, totalOutputTokens: 20 } },
      { ActionActor: { finalOutcome: "Mocked Response", isTaskComplete: true, actionHistory: [] } }
    ]));

    const response = await ChannelRouter.route(payload);

    // Response is now always an object with .message and .telemetry
    expect(response).toMatchObject({ message: "Mocked Response" });
    expect(MidpointXGraph.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        userIntent: payload.intent,
        operatorIdentity: expect.objectContaining({
          uid: payload.userId,
          source: payload.channel
        }),
        executionMode: "api"
      }),
      expect.any(Object)
    );
  });

  it("should handle graph failures gracefully", async () => {
    (MidpointXGraph.stream as jest.Mock).mockRejectedValueOnce(new Error("Simulated Graph Failure"));

    const response = await ChannelRouter.route({
      userId: "user-123",
      intent: "Cause error",
      channel: "discord"
    });

    expect(response).toContain("⚠️ Internal Agent Error");
    expect(response).toContain("Simulated Graph Failure");
  });

  it("should return a fallback message if finalOutcome is missing", async () => {
    (MidpointXGraph.stream as jest.Mock).mockReturnValue(mockStream([
      { ActionActor: { isTaskComplete: true, finalOutcome: "", actionHistory: [] } }
    ]));

    const response = await ChannelRouter.route({
      userId: "user-123",
      intent: "Empty response",
      channel: "web"
    });

    expect(response).toMatchObject({ message: "Done." });
  });

  it("should enforce A2A safety handshakes for API channel", async () => {
    const response = await ChannelRouter.route({
      userId: "user-123",
      intent: "API call",
      channel: "api"
      // Missing a2aCertificate
    });

    expect(response).toContain("⚠️ A2A REJECTION: Missing Safety Certificate");
  });

  it("should call MemoryManager.logSession after a completed task", async () => {
    (MidpointXGraph.stream as jest.Mock).mockReturnValue(mockStream([
      {
        ActionActor: {
          finalOutcome: "Done!",
          isTaskComplete: true,
          internalTurns: 5,
          actionHistory: [
            { tool: "fetch__fetch", args: {}, result: "{}" },
            { tool: "filesystem__read_text_file", args: {}, result: "{}" }
          ]
        }
      }
    ]));

    await ChannelRouter.route({
      userId: "user-123",
      intent: "Read a file and summarize",
      channel: "telegram"
    });

    // logSession is called fire-and-forget so give the microtask queue a tick
    await new Promise(resolve => setImmediate(resolve));

    expect(MemoryManager.logSession).toHaveBeenCalledWith(
      expect.stringContaining("TELEGRAM"),
      "Read a file and summarize",
      "Done!",
      expect.arrayContaining(["fetch__fetch", "filesystem__read_text_file"]),
      expect.any(Object)  // optional metadata (e.g. { proactive: false })
    );
  });

  it("should include turn and token telemetry in the response", async () => {
    (MidpointXGraph.stream as jest.Mock).mockReturnValue(mockStream([
      { ReflectionActor: { totalInputTokens: 100, totalOutputTokens: 50 } },
      { ActionActor: { finalOutcome: "Result", isTaskComplete: true, internalTurns: 3, actionHistory: [] } }
    ]));

    const response = await ChannelRouter.route({
      userId: "user-123",
      intent: "Quick task",
      channel: "web"
    });

    expect(response).toMatchObject({
      message: "Result",
      telemetry: {
        turns: expect.any(Number),
        tokens: { input: expect.any(Number), output: expect.any(Number) }
      }
    });
  });
});

