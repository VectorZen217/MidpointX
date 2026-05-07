import "dotenv/config";
import { z } from "zod";
import { MidpointXState } from "../core/state";
import { LLMFactory } from "../core/llmFactory";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { invokeWithResilience } from "../core/resilience";

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

  return { 
    isJustified: evaluation.isJustified,
    totalInputTokens: 0, 
    totalOutputTokens: 0
  };
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

  return { 
    regressionPassed: passed,
    totalInputTokens: 0,
    totalOutputTokens: 0
  };
}
