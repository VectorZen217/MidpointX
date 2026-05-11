import { invokeWithResilience } from '../core/resilience';
import { MidpointXState } from "../core/state";
import { MemoryManager } from "../core/memory";
import { A2AProtocol } from "../core/protocol";

/**
 * NODE 6: ModifyActor (The State Committer)
 * Only commits logic shifts if they have passed all safeguards.
 */
export async function modifyNode(state: typeof MidpointXState.State) {
  console.log("\ud83d\udee1\ufe0f [ModifyActor] Evaluating state for memory commitment...");

  // 1. If no shift was proposed by the LearnActor, simply pass through to Action
  if (!state.proposedShift) {
    console.log("\u23e9 [ModifyActor] No novel logic to commit. Proceeding to execution.");
    return A2AProtocol.commit("ModifyActor", {}); 
  }

  // 2. If a shift exists, but safeguards failed, we REJECT the commit
  if (!state.isJustified || !state.regressionPassed) {
    console.warn(`\ud83d\udea8 [ModifyActor] Safeguards failed! Rejecting theorem: ${state.proposedShift.theoremId}`);
    // We wipe the proposed shift from the state so the ActionActor doesn't use it
    return A2AProtocol.commit("ModifyActor", { proposedShift: null }); 
  }

  // 3. Safeguards passed. Commit to memory.
  console.log(`\ud83d\udfe2 [ModifyActor] Safeguards verified. Authorizing memory commit.`);
  
  const success = await MemoryManager.commitTheorem(
    state.proposedShift, 
    state.taskId // We use the Task ID as the Trace ID for auditing
  );

  if (!success) {
    throw new Error("Critical Failure: Could not persist validated theorem to Context Store.");
  }

  // We return the state unchanged, allowing the graph to proceed to ActionActor
  return A2AProtocol.commit("ModifyActor", {});
}


