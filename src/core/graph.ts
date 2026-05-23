import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { MidpointXState } from "./state";

// Explicit state type — needed because builder is cast to `any` above,
// which loses inference on callback parameters.
type GraphState = typeof MidpointXState.State;
import { reflectNode, analyzeNode, supervisorNode, learnNode, silentAssessmentNode } from "../nodes/cognitiveNodes";
import { justifyNode, regressNode, verificationNode } from "../nodes/safeguardNodes";
import { modifyNode } from "../nodes/modifyNode";
import { compilerNode } from "../nodes/compilerNode";
import { selectionActor, executionActor } from "../nodes/executionNodes";
import { compactionNode } from "../nodes/compactionNode";
import { pruningNode } from "../nodes/pruningNode";
import { researchWorkerNode, developerWorkerNode, testerWorkerNode } from "../nodes/swarmWorkerNodes";
import { skillAcquisitionNode } from "../nodes/skillAcquisitionNode";

// 1. Persistent Checkpointer for Human-in-the-Loop
const checkpointer = new MemorySaver();

// 2. Initialize the Graph with our State
// LangGraph's imperative builder pattern means TypeScript cannot incrementally
// track node names added across separate statements. Each addEdge/addConditionalEdges
// call is type-checked before subsequent addNode calls register their names, so
// every node name appears invalid until the graph is complete. Casting to `any`
// here is a targeted workaround — type safety is preserved in all imported node
// functions and in the compile() call below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const builder = new StateGraph(MidpointXState) as any;

// 3. Add Nodes
builder.addNode("SilentAssessmentActor", (state: GraphState) => silentAssessmentNode(state));
builder.addNode("ReflectionActor", (state: GraphState) => reflectNode(state));
builder.addNode("AnalysisActor", (state: GraphState) => analyzeNode(state));
builder.addNode("SupervisorActor", (state: GraphState) => supervisorNode(state));
builder.addNode("LearnActor", (state: GraphState) => learnNode(state));
builder.addNode("CompactionActor", compactionNode);
builder.addNode("ModifyActor", modifyNode);
builder.addNode("CompilerActor", compilerNode);
builder.addNode("JustificationProtocol", justifyNode);
builder.addNode("VerificationNode", verificationNode);
builder.addNode("RegressionTester", regressNode);
builder.addNode("SelectionActor", selectionActor);
builder.addNode("ExecutionActor", executionActor);
builder.addNode("PruningActor", pruningNode);
builder.addNode("ResearcherActor", (state: GraphState) => researchWorkerNode(state));
builder.addNode("DeveloperActor", (state: GraphState) => developerWorkerNode(state));
builder.addNode("TesterActor", (state: GraphState) => testerWorkerNode(state));
builder.addNode("SkillAcquisitionActor", (state: GraphState) => skillAcquisitionNode(state));

/**
 * Security: Human-in-the-Loop Breakpoint
 * This node does nothing but serve as a target for 'interruptBefore'.
 */
builder.addNode("HumanApprovalGate", (state: GraphState) => {
  console.log("⏸️ [Graph] Human approval required. Pausing execution...");
  return state;
});

// 4. Main Workflow Path
builder.addConditionalEdges(
  START,
  (state: GraphState) => state.proactiveTrigger ? "silent_assessment" : "reflection",
  {
    silent_assessment: "SilentAssessmentActor",
    reflection: "ReflectionActor"
  }
);

builder.addConditionalEdges(
  "SilentAssessmentActor",
  (state: GraphState) => {
    if (state.assessmentDecision === "DROP") return "end";
    if (state.assessmentDecision === "NOTIFY") return "approval"; // Drops to human loop for review/undo
    if (state.assessmentDecision === "ACTION") return "reflection"; // Worker Swarm route
    return "end"; // Fallback
  },
  {
    end: END,
    approval: "HumanApprovalGate",
    reflection: "ReflectionActor"
  }
);

builder.addEdge("ReflectionActor", "AnalysisActor");

// Lean AnalysisActor runs exactly once per mission — no worker routing.
builder.addEdge("AnalysisActor", "CompactionActor");

// SupervisorActor handles all worker orchestration and complex replanning.
builder.addConditionalEdges(
  "SupervisorActor",
  (state: GraphState) => {
    if (state.isTaskComplete) return "compaction";
    if (state.skillGapQuery) return "skill_acquisition";
    if (state.activeWorker === "researcher") return "researcher";
    if (state.activeWorker === "developer") return "developer";
    if (state.activeWorker === "tester") return "tester";
    return "compaction";
  },
  {
    compaction: "CompactionActor",
    skill_acquisition: "SkillAcquisitionActor",
    researcher: "ResearcherActor",
    developer: "DeveloperActor",
    tester: "TesterActor"
  }
);

builder.addEdge("ResearcherActor", "SupervisorActor");
builder.addEdge("DeveloperActor", "SupervisorActor");
builder.addEdge("TesterActor", "SupervisorActor");
// After acquiring a skill, return to the Supervisor so it can retry with new knowledge
builder.addEdge("SkillAcquisitionActor", "SupervisorActor");

builder.addEdge("CompactionActor", "SelectionActor");

// 5. Execution Loop with Security Gates
builder.addConditionalEdges(
  "SelectionActor",
  (state: GraphState) => {
    // If task is complete, move to the learning phase
    if (state.isTaskComplete) return "learn";
    
    // If destructive action is selected and not yet approved, hit the gate
    if (state.needsApproval && state.approvalStatus === "pending") return "approval";
    
    // Route to SupervisorActor for complex replanning or step-boundary management
    if (!state.pendingAction) return "supervisor";

    return "execute";
  },
  {
    execute: "ExecutionActor",
    approval: "HumanApprovalGate",
    learn: "LearnActor",
    supervisor: "SupervisorActor"
  }
);

// Resuming from Approval always goes to Execution
builder.addEdge("HumanApprovalGate", "ExecutionActor");

// After execution, loop back for next turn
builder.addEdge("ExecutionActor", "CompactionActor");

// 6. Post-Execution Learning & Solidification
builder.addConditionalEdges(
  "LearnActor",
  (state: GraphState) => state.proposedShift ? "needs_validation" : "prune",
  {
    needs_validation: "JustificationProtocol",
    prune: "PruningActor"
  }
);

// 7. Safeguard & Committal Path
builder.addEdge("JustificationProtocol", "VerificationNode");
builder.addEdge("VerificationNode", "RegressionTester");
builder.addEdge("RegressionTester", "ModifyActor");
builder.addEdge("ModifyActor", "CompilerActor");

builder.addConditionalEdges(
  "CompilerActor",
  (state: GraphState) => state.needsRecompile ? "modify" : "prune",
  {
    modify: "ModifyActor",
    prune: "PruningActor"
  }
);

builder.addEdge("PruningActor", END);

// 8. Compile the Graph with Interrupts
export const MidpointXGraph = builder.compile({
  checkpointer,
  interruptBefore: ["HumanApprovalGate"]
});
