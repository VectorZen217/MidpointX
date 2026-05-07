import { ChannelRouter } from "../core/channelRouter";
import { MidpointXGraph } from "../core/graph";

// Mock the graph to prevent actual LLM calls during unit tests
jest.mock("../core/graph", () => ({
  MidpointXGraph: {
    invoke: jest.fn().mockResolvedValue({ finalOutcome: "Mocked Response" })
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
      channel: "telegram" as const
    };

    const response = await ChannelRouter.route(payload);

    expect(response).toBe("Mocked Response");
    expect(MidpointXGraph.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        userIntent: payload.intent,
        operatorIdentity: expect.objectContaining({
          id: payload.userId,
          source: payload.channel
        })
      }),
      expect.any(Object)
    );
  });

  it("should handle graph failures gracefully", async () => {
    (MidpointXGraph.invoke as jest.Mock).mockRejectedValueOnce(new Error("Simulated Graph Failure"));

    const response = await ChannelRouter.route({
      userId: "user-123",
      intent: "Cause error",
      channel: "discord"
    });

    expect(response).toContain("Internal Agent Error");
    expect(response).toContain("Simulated Graph Failure");
  });

  it("should return a fallback message if finalOutcome is missing", async () => {
    (MidpointXGraph.invoke as jest.Mock).mockResolvedValueOnce({ finalOutcome: "" });

    const response = await ChannelRouter.route({
      userId: "user-123",
      intent: "Empty response",
      channel: "web"
    });

    expect(response).toBe("Execution completed, but I have no specific outcome to report.");
  });
});
