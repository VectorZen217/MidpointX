import { selectionActor } from "../nodes/executionNodes";
import { ScreenCapture } from "../plugins/desktop/ScreenCapture";
import { LLMFactory } from "../core/llmFactory";

jest.mock("../plugins/desktop/ScreenCapture", () => ({
  ScreenCapture: {
    captureBase64: jest.fn().mockResolvedValue("fake_base64_data")
  }
}));
jest.mock("../core/llmFactory", () => ({
  LLMFactory: {
    getModel: jest.fn().mockReturnValue({
      bindTools: jest.fn().mockReturnThis()
    })
  }
}));
jest.mock("../core/workspaceLoader", () => ({
  WorkspaceLoader: {
    getAgentPersona: jest.fn().mockReturnValue("Test Persona"),
    getUserContext: jest.fn().mockReturnValue("Test Context")
  }
}));
jest.mock("../core/resilience", () => ({
  invokeWithResilience: jest.fn().mockResolvedValue({
    content: "Mocked Response",
    tool_calls: [],
    usage_metadata: { input_tokens: 10, output_tokens: 20 }
  })
}));

describe("MidpointX State Management", () => {
  test("selectionActor should prune visualBuffer (LIFO)", async () => {
    const initialState: any = {
      visualBuffer: ["frame1", "frame2", "frame3"],
      actionHistory: [],
      internalTurns: 0,
      strategicPlan: [],
      planStatus: {},
      conciseIntent: "test",
      analysisResult: "test analysis"
    };

    const result = await selectionActor(initialState as any) as any;

    // The selectionActor should return an empty visualBuffer to prune state
    expect(result.visualBuffer).toEqual([]);
  }, 15000); // Increased timeout for LLM + state processing
});
