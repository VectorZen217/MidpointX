import { ChannelRouter } from "../src/core/channelRouter";
import { MidpointXGraph } from "../src/core/graph";

jest.mock("../src/core/graph", () => ({
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
});
