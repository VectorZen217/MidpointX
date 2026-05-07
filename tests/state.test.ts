import { selectionActor } from "../src/nodes/executionNodes";
import { MidpointXState } from "../src/core/state";

describe("MidpointX State Management", () => {
  test("selectionActor should prune visualBuffer (LIFO)", async () => {
    const initialState: any = {
      visualBuffer: ["frame1", "frame2", "frame3"],
      actionHistory: [],
      internalTurns: 0
    };

    const result = await selectionActor(initialState as any);
    
    // The selectionActor should return an empty visualBuffer to prune state
    expect(result.visualBuffer).toEqual([]);
  });

  test("Graph should support highFidelityContext injection", () => {
    // This is a structural test to ensure the state definition supports the field
    const state = MidpointXState.State;
    // @ts-ignore - Accessing internal schema
    const schema = MidpointXState.spec;
    expect(schema).toHaveProperty("highFidelityContext");
  });
});
