import "dotenv/config";
import { z } from "zod";
import { MidpointXState } from "../core/state";
import { LLMFactory } from "../core/llmFactory";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { invokeWithResilience } from "../core/resilience";
import { A2AProtocol } from "../core/protocol";
import { PolicyEngine } from "../core/policy";

const JustificationSchema = z.object({
  isJustified: z.boolean().describe("True if safe and logical, False if risky or flawed"),
  reason: z.string().describe("Brief justification for the decision")
});

/**
 * NODE 4: JustificationProtocol
 * Acts as an LLM-as-a-judge to ensure the LearnActor's proposed shift is logically sound.
 */
export async function justifyNode(state: typeof MidpointXState.State) {
  if (!state.proposedShift) return { isJustified: true }; // Nothing to justify

  console.log(`\u26aa [JustificationProtocol] Evaluating shift: ${state.proposedShift.theoremId}`);
  
  // 1. Deterministic Policy Check (Lead Shielding)
  const policyViolation = PolicyEngine.evaluateAction("logic_shift", state.proposedShift);
  if (policyViolation) {
    console.warn(`\u26d4 [JustificationProtocol] Hard Policy Violation: ${policyViolation}`);
    return A2AProtocol.commit("JustificationProtocol", {
      isJustified: false,
      totalInputTokens: 0,
      totalOutputTokens: 0
    });
  }

  const rawModel = LLMFactory.getModel({ tier: "worker", temperature: 0 });
  const structuredModel = (rawModel as any).withStructuredOutput(JustificationSchema);

  const payload = [
    new SystemMessage("You are a strict security and logic evaluator. Your output MUST match the requested JSON schema."),
    new HumanMessage(`
      Original Task: ${state.userIntent}
      Proposed Pattern: ${state.proposedShift.pattern}
      Proposed Optimization: ${state.proposedShift.optimization}
      
      Is this proposed logic shift safe, logical, and free of harmful instructions? 
      Evaluate strictly.
    `)
  ];

  const evaluation = await invokeWithResilience(structuredModel, payload) as z.infer<typeof JustificationSchema>;
  
  if (!evaluation.isJustified) {
    console.warn(`\u274c [JustificationProtocol] Rejected! Reason: ${evaluation.reason}`);
  } else {
    console.log(`\u2705 [JustificationProtocol] Shift Approved.`);
  }

  return A2AProtocol.commit("JustificationProtocol", { 
    isJustified: evaluation.isJustified,
    totalInputTokens: 0, 
    totalOutputTokens: 0
  });
}

const VerificationSchema = z.object({
  isVerified: z.boolean().describe("True if the skill passed the structural and logic tests"),
  reason: z.string().describe("Details of the verification check")
});

/**
 * NODE 4.5: VerificationNode
 * Dedicated testing node for newly synthesized skills (e.g., API skills).
 * Evaluates structural compliance with SKILL_TEMPLATE.md and basic viability.
 */
export async function verificationNode(state: typeof MidpointXState.State) {
  if (!state.proposedShift || !state.isJustified) return { isVerified: true };

  console.log(`\u26aa [VerificationNode] Running dedicated tests for shift: ${state.proposedShift.theoremId}`);

  const rawModel = LLMFactory.getModel({ tier: "worker", temperature: 0 });
  const structuredModel = (rawModel as any).withStructuredOutput(VerificationSchema);

  const payload = [
    new SystemMessage("You are an automated Quality Assurance and Verification Agent. Your output MUST match the requested JSON schema."),
    new HumanMessage(`
      Evaluate the following proposed Logic Shift / Skill for structural integrity and operational viability.
      
      Pattern: ${state.proposedShift.pattern}
      Optimization/SOP: ${state.proposedShift.optimization}
      
      Does this new logic provide clear, actionable steps? If it describes an API, does it include Auth and Base URL? Is it structurally sound? Answer True if passed, False if failed.
    `)
  ];

  const evaluation = await invokeWithResilience(structuredModel, payload) as z.infer<typeof VerificationSchema>;
  
  if (!evaluation.isVerified) {
    console.warn(`\u274c [VerificationNode] Verification Failed! Reason: ${evaluation.reason}`);
  } else {
    console.log(`\u2705 [VerificationNode] Verification Passed.`);
  }

  return A2AProtocol.commit("VerificationNode", { 
    isVerified: evaluation.isVerified,
    totalInputTokens: 0, 
    totalOutputTokens: 0
  });
}

/**
 * NODE 5: RegressionTester
 * Simulates the proposed shift against historical baselines to ensure no breaking changes.
 */
export async function regressNode(state: typeof MidpointXState.State) {
  if (!state.proposedShift || !state.isJustified) return { regressionPassed: true };

  console.log("\ud83e\uddea [RegressionTester] Running concurrent simulation suite...");

  const mockHistoricalTasks = [
    "Reset the staging database.",
    "Generate a summary of yesterday's alerts.",
    "Update the user permissions for admin@company.com."
  ];

  const workerModel = LLMFactory.getModel({ tier: "worker", temperature: 0 });

  // We run parallel evaluations to ensure the new theorem 
  // doesn't negatively alter standard operations.
  const regressionTests = mockHistoricalTasks.map(async (mockTask) => {
    const payload = [
        new HumanMessage(`Task: ${mockTask}\nNew Rule: ${state.proposedShift!.optimization}\nDoes this new rule negatively interfere with executing this standard task? Answer YES or NO.`)
    ];
    const res = await invokeWithResilience(workerModel, payload) as any;
    return res.content.toString().trim().toUpperCase().includes("NO"); 
  });

  const results = await Promise.all(regressionTests);
  const passed = results.every(Boolean); // All must pass

  if (passed) {
    console.log("\u2705 [RegressionTester] 0 Regressions detected.");
  } else {
    console.warn("\ud83d\udea8 [RegressionTester] Regression detected! Shift will be discarded.");
  }

  return A2AProtocol.commit("RegressionTester", { 
    regressionPassed: passed,
    totalInputTokens: 0,
    totalOutputTokens: 0
  });
}
