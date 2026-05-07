import { selectionActor } from "../nodes/executionNodes";

describe("MidpointX State Management", () => {
  test("selectionActor should prune visualBuffer (LIFO)", async () => {
    const initialState: any = {
      visualBuffer: ["frame1", "frame2", "frame3"],
      actionHistory: [],
      internalTurns: 0
    };

    const result = await selectionActor(initialState as any) as any;
    
    // The selectionActor should return an empty visualBuffer to prune state
    expect(result.visualBuffer).toEqual([]);
  });
});
