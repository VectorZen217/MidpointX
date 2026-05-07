import { MidpointXState } from "../core/state";
import { LLMFactory } from "../core/llmFactory";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { extractText } from "./cognitiveNodes";

/**
 * NODE 8: CompactionActor
 * Triggered when state tokens exceed threshold.
 * Summarizes the reasoning trace and prunes the action history.
 */
export async function compactionNode(state: typeof MidpointXState.State) {
  const HISTORY_LIMIT = 8;
  
  // Always increment turn counter regardless of compaction
  const turnIncrement = { internalTurns: 1 };

  if (state.actionHistory.length < HISTORY_LIMIT) {
    console.log(`🧹 [CompactionActor] Context lean (${state.actionHistory.length} actions). Skipping.`);
    return turnIncrement;
  }

  console.log(`🧹 [CompactionActor] Context limit reached (${state.actionHistory.length} actions). Condensing...`);

  const workerModel = LLMFactory.getModel({ tier: "worker", temperature: 0 });
  
  // Distill the OLDEST actions into a milestone summary
  const toSummarize = state.actionHistory.slice(0, state.actionHistory.length - 5);
  const remainingHistory = state.actionHistory.slice(-(state.actionHistory.length - 5));

  const historyStr = toSummarize.map((h: any, i: number) => `Turn ${i+1}: Action ${h.tool} -> Result: ${h.result}`).join("\n");

  const payload = [
    new SystemMessage("You are a high-fidelity context manager. Distill the following agent actions into a 'Milestone Summary' that preserves the original intent and key accomplishments. Include any critical state changes (e.g. 'Successfully authenticated') or discovered constants (e.g. 'Project root is D:/repo')."),
    new HumanMessage(`Original Intent: ${state.conciseIntent || state.userIntent}\nExisting Summary: ${state.historySummary}\n\nActions to compress:\n${historyStr}`)
  ];

  const response = await workerModel.invoke(payload);
  const summary = extractText(response.content);

  return {
    ...turnIncrement,
    historySummary: summary,
    actionHistory: remainingHistory
  };
}
