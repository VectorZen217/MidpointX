import { ChannelRouter } from "../core/channelRouter";
import { MidpointXGraph } from "../core/graph";

jest.mock("../core/graph", () => ({
  MidpointXGraph: {
    stream: jest.fn()
  }
}));

describe("ChannelRouter & Graph Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("route should pass highFidelityContext to the graph", async () => {
    const mockStream = MidpointXGraph.stream as jest.Mock;
    mockStream.mockResolvedValue([
      { "__end__": { finalOutcome: "Success" } }
    ]);

    const photos = ["base64_data_1"];
    await ChannelRouter.route({
      userId: "test_user",
      intent: "Look at this photo",
      channel: "telegram",
      highFidelityContext: photos
    }, () => {});

    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userIntent: "Look at this photo",
        highFidelityContext: photos
      }),
      expect.any(Object)
    );
  });

  test("Refusal logic should trigger for 'Null Evidence' (blank images)", async () => {
    const mockStream = MidpointXGraph.stream as jest.Mock;
    // Ensure the final chunk contains the refusal in the finalOutcome field
    mockStream.mockResolvedValue([
      { "__end__": { finalOutcome: "DISCIPLINED REFUSAL: The provided image is blank or corrupted. I cannot extract grounding data." } }
    ]);

    const result = await ChannelRouter.route({
      userId: "test_user",
      intent: "What is in this blank photo?",
      channel: "telegram",
      highFidelityContext: ["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="] // 1x1 blank pixel
    }, () => {});

    expect(result).toContain("DISCIPLINED REFUSAL");
  });

  test("A2A Handshake should reject agents with lax thresholds", async () => {
    const laxCert: any = {
      agentId: "lax-agent",
      refusalThreshold: 0.01, // Too low
      capabilities: ["disciplined_refusal"]
    };

    const result = await ChannelRouter.route({
      userId: "agent-1",
      intent: "Collaborate with me",
      channel: "api",
      a2aCertificate: laxCert
    }, () => {});

    expect(result).toContain("A2A REJECTION: Safety Handshake failed");
  });

  test("A2A Handshake should accept aligned agents", async () => {
    const mockStream = MidpointXGraph.stream as jest.Mock;
    mockStream.mockResolvedValue([{ "__end__": { finalOutcome: "Handshake verified" } }]);

    const alignedCert: any = {
      agentId: "safe-agent",
      refusalThreshold: 0.1,
      capabilities: ["disciplined_refusal"]
    };

    const result = await ChannelRouter.route({
      userId: "agent-2",
      intent: "Scan this system",
      channel: "api",
      a2aCertificate: alignedCert
    }, () => {});

    expect(result).not.toContain("A2A REJECTION");
  });

  test("A2A Handshake should reject 'Trust Laundering' (untrusted originator via trusted proxy)", async () => {
    // 1. Establish a trusted proxy agent
    const proxyCert: any = {
      agentId: "trusted-proxy",
      refusalThreshold: 0.1,
      capabilities: ["disciplined_refusal"]
    };
    await ChannelRouter.route({ userId: "p1", intent: "Init", channel: "api", a2aCertificate: proxyCert }, () => {});

    // 2. Attempt a delegated request from an untrusted originator
    const delegatedCert: any = {
      agentId: "trusted-proxy",
      isDelegated: true,
      originatorId: "malicious-agent-X",
      refusalThreshold: 0.1,
      capabilities: ["disciplined_refusal"]
    };

    const result = await ChannelRouter.route({
      userId: "p1",
      intent: "Run sensitive command",
      channel: "api",
      a2aCertificate: delegatedCert
    }, () => {});

    expect(result).toContain("A2A REJECTION: Safety Handshake failed. Alignment proof is insufficient.");
  });
});
