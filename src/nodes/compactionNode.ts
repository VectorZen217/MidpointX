import { MidpointXState } from "../core/state";
import { LLMFactory } from "../core/llmFactory";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { extractText } from "./cognitiveNodes";

// Characters per estimated token (rough approximation for mixed text/JSON)
const CHARS_PER_TOKEN = 4;
// Trigger compaction when estimated history context exceeds this token count
const TOKEN_BUDGET = 6000;
// Number of recent actions to keep un-compressed (sliding window)
const RETENTION_WINDOW = 3;
// Max chars per action result before feeding to the summarizer
const RESULT_SUMMARY_CAP = 500;

/**
 * NODE 8: CompactionActor
 * Triggered when estimated token cost of action history exceeds TOKEN_BUDGET.
 * Summarizes the oldest actions into a rolling milestone summary and prunes history.
 */
export async function compactionNode(state: typeof MidpointXState.State) {
  // Increment turn counter — must be absolute value since reducer is now overwrite (not additive)
  const currentTurns = (state.internalTurns || 0) + 1;
  const turnIncrement = { internalTurns: currentTurns };

  if (state.actionHistory.length === 0) {
    return turnIncrement;
  }

  // Estimate token cost of the full action history
  const estimatedTokens = state.actionHistory.reduce((sum: number, h: any) => {
    const resultLen = typeof h.result === "string" ? h.result.length : JSON.stringify(h.result || "").length;
    return sum + resultLen;
  }, 0) / CHARS_PER_TOKEN;

  if (estimatedTokens < TOKEN_BUDGET && state.actionHistory.length < 12) {
    console.log(`🧹 [CompactionActor] Context lean (~${Math.round(estimatedTokens)} tokens, ${state.actionHistory.length} actions). Skipping.`);
    return turnIncrement;
  }

  const toCompress = state.actionHistory.slice(0, state.actionHistory.length - RETENTION_WINDOW);
  const remainingHistory = state.actionHistory.slice(-RETENTION_WINDOW);

  console.log(`🧹 [CompactionActor] Budget exceeded (~${Math.round(estimatedTokens)} tokens). Compressing ${toCompress.length} actions, retaining ${remainingHistory.length}.`);

  const workerModel = LLMFactory.getModel({ tier: "worker", temperature: 0 });

  // Pre-truncate results to prevent the summarizer call itself from being expensive
  const historyStr = toCompress.map((h: any, i: number) => {
    const result = typeof h.result === "string" ? h.result : JSON.stringify(h.result || "");
    const truncated = result.length > RESULT_SUMMARY_CAP
      ? result.substring(0, RESULT_SUMMARY_CAP) + `... [+${result.length - RESULT_SUMMARY_CAP} chars]`
      : result;
    return `Turn ${i + 1}: [${h.tool}] -> ${truncated}`;
  }).join("\n");

  const payload = [
    new SystemMessage("You are a high-fidelity context manager. Distill the following agent actions into a 'Milestone Summary' that preserves the original intent and key accomplishments. Include any critical state changes (e.g. 'Successfully authenticated') or discovered constants (e.g. 'Project root is D:/repo'). Be concise — max 200 words."),
    new HumanMessage(`Original Intent: ${state.conciseIntent || state.userIntent}\nExisting Summary: ${state.historySummary || "none"}\n\nActions to compress:\n${historyStr}`)
  ];

  const response = await workerModel.invoke(payload);
  const summary = extractText(response.content);

  return {
    ...turnIncrement,
    historySummary: summary,
    actionHistory: remainingHistory
  };
}
