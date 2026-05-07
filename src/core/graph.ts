// @ts-nocheck
import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { MidpointXState } from "./state";
import { reflectNode, analyzeNode, learnNode } from "../nodes/cognitiveNodes";
import { justifyNode, regressNode } from "../nodes/safeguardNodes";
import { modifyNode } from "../nodes/modifyNode";
import { selectionActor, executionActor } from "../nodes/executionNodes";
import { compactionNode } from "../nodes/compactionNode";
import { pruningNode } from "../nodes/pruningNode";

// 1. Persistent Checkpointer for Human-in-the-Loop
const checkpointer = new MemorySaver();

// 2. Initialize the Graph with our State
const builder = new StateGraph(MidpointXState);

// 3. Add Nodes
builder.addNode("ReflectionActor", reflectNode);
builder.addNode("AnalysisActor", analyzeNode);
builder.addNode("LearnActor", learnNode);
builder.addNode("CompactionActor", compactionNode);
builder.addNode("ModifyActor", modifyNode);
builder.addNode("JustificationProtocol", justifyNode);
builder.addNode("RegressionTester", regressNode);
builder.addNode("SelectionActor", selectionActor);
builder.addNode("ExecutionActor", executionActor);
builder.addNode("PruningActor", pruningNode);

/**
 * Security: Human-in-the-Loop Breakpoint
 * This node does nothing but serve as a target for 'interruptBefore'.
 */
builder.addNode("HumanApprovalGate", (state) => {
  console.log("⏸️ [Graph] Human approval required. Pausing execution...");
  return state;
});

// 4. Main Workflow Path
builder.addEdge(START, "ReflectionActor");
builder.addEdge("ReflectionActor", "AnalysisActor");
builder.addEdge("AnalysisActor", "CompactionActor");
builder.addEdge("CompactionActor", "SelectionActor");

// 5. Execution Loop with Security Gates
builder.addConditionalEdges(
  "SelectionActor",
  (state) => {
    // If task is complete, move to the learning phase
    if (state.isTaskComplete) return "learn";
    
    // If destructive action is selected and not yet approved, hit the gate
    if (state.needsApproval && state.approvalStatus === "pending") return "approval";
    
    // Handle Re-planning Loop-back
    if (state.failureThesis && !state.pendingAction) return "replan";

    return "execute";
  },
  {
    execute: "ExecutionActor",
    approval: "HumanApprovalGate",
    learn: "LearnActor",
    replan: "AnalysisActor"
  }
);

// Resuming from Approval always goes to Execution
builder.addEdge("HumanApprovalGate", "ExecutionActor");

// After execution, loop back for next turn
builder.addEdge("ExecutionActor", "CompactionActor");

// 6. Post-Execution Learning & Solidification
builder.addConditionalEdges(
  "LearnActor",
  (state) => state.proposedShift ? "needs_validation" : "prune",
  {
    needs_validation: "JustificationProtocol",
    prune: "PruningActor"
  }
);

// 7. Safeguard & Committal Path
builder.addEdge("JustificationProtocol", "RegressionTester");
builder.addEdge("RegressionTester", "ModifyActor");
builder.addEdge("ModifyActor", "PruningActor");
builder.addEdge("PruningActor", END);

// 8. Compile the Graph with Interrupts
export const MidpointXGraph = builder.compile({
  checkpointer,
  interruptBefore: ["HumanApprovalGate"]
});
