// @ts-nocheck
import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { MidpointXState } from "./state";
import { reflectNode, analyzeNode, learnNode, silentAssessmentNode } from "../nodes/cognitiveNodes";
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
const builder = new StateGraph(MidpointXState);

// 3. Add Nodes
builder.addNode("SilentAssessmentActor", (state) => silentAssessmentNode(state));
builder.addNode("ReflectionActor", (state) => reflectNode(state));
builder.addNode("AnalysisActor", (state) => analyzeNode(state));
builder.addNode("LearnActor", (state) => learnNode(state));
builder.addNode("CompactionActor", compactionNode);
builder.addNode("ModifyActor", modifyNode);
builder.addNode("CompilerActor", compilerNode);
builder.addNode("JustificationProtocol", justifyNode);
builder.addNode("VerificationNode", verificationNode);
builder.addNode("RegressionTester", regressNode);
builder.addNode("SelectionActor", selectionActor);
builder.addNode("ExecutionActor", executionActor);
builder.addNode("PruningActor", pruningNode);
builder.addNode("ResearcherActor", (state) => researchWorkerNode(state));
builder.addNode("DeveloperActor", (state) => developerWorkerNode(state));
builder.addNode("TesterActor", (state) => testerWorkerNode(state));
builder.addNode("SkillAcquisitionActor", (state) => skillAcquisitionNode(state));

/**
 * Security: Human-in-the-Loop Breakpoint
 * This node does nothing but serve as a target for 'interruptBefore'.
 */
builder.addNode("HumanApprovalGate", (state) => {
  console.log("⏸️ [Graph] Human approval required. Pausing execution...");
  return state;
});

// 4. Main Workflow Path
builder.addConditionalEdges(
  START,
  (state) => state.proactiveTrigger ? "silent_assessment" : "reflection",
  {
    silent_assessment: "SilentAssessmentActor",
    reflection: "ReflectionActor"
  }
);

builder.addConditionalEdges(
  "SilentAssessmentActor",
  (state) => {
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

builder.addConditionalEdges(
  "AnalysisActor",
  (state) => {
    if (state.isTaskComplete) return "compaction";
    // Skill gap takes priority — divert to acquire before assigning a worker
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

builder.addEdge("ResearcherActor", "AnalysisActor");
builder.addEdge("DeveloperActor", "AnalysisActor");
builder.addEdge("TesterActor", "AnalysisActor");
// After acquiring a skill, return to the supervisor so it can retry with new knowledge
builder.addEdge("SkillAcquisitionActor", "AnalysisActor");

builder.addEdge("CompactionActor", "SelectionActor");

// 5. Execution Loop with Security Gates
builder.addConditionalEdges(
  "SelectionActor",
  (state) => {
    // If task is complete, move to the learning phase
    if (state.isTaskComplete) return "learn";
    
    // If destructive action is selected and not yet approved, hit the gate
    if (state.needsApproval && state.approvalStatus === "pending") return "approval";
    
    // Handle Loop-back to Supervisor if no action is pending
    if (!state.pendingAction) return "replan";

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
builder.addEdge("JustificationProtocol", "VerificationNode");
builder.addEdge("VerificationNode", "RegressionTester");
builder.addEdge("RegressionTester", "ModifyActor");
builder.addEdge("ModifyActor", "CompilerActor");

builder.addConditionalEdges(
  "CompilerActor",
  (state) => state.needsRecompile ? "modify" : "prune",
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
