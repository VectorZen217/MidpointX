import crypto from "crypto";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { GoalTracker, WorkerType, CreateTaskInput } from "../core/goalTracker";
import { LLMFactory } from "../core/llmFactory";
import { TelegramService } from "../services/telegramService";
import { MidpointXState } from "../core/state";

const GoalTaskSchema = z.object({
  title: z.string().describe("Short label for this step (shown in UI)"),
  description: z.string().describe("What the worker must accomplish"),
  dependsOn: z.array(z.string()).describe("Titles of tasks that must complete before this one"),
  estimatedComplexity: z.enum(["simple", "medium", "complex"]),
  assignedWorker: z.enum(["researcher", "developer", "tester", "executor"]),
});

const DecompositionSchema = z.object({
  tasks: z.array(GoalTaskSchema).max(12),
  rationale: z.string(),
});

export async function goalDecomposerNode(state: typeof MidpointXState.State) {
  console.log("🎯 [GoalDecomposerActor] Checking for active goal or decomposing...");

  // Resume check: if this LangGraph taskId already has an active goal, skip decomposition
  if (state.taskId) {
    const existing = GoalTracker.getActiveGoal(state.taskId);
    if (existing) {
      console.log(`🔄 [GoalDecomposerActor] Resuming active goal ${existing.id} (${existing.task_count} tasks)`);
      return { activeGoalId: existing.id };
    }
  }

  const userIntent = state.userIntent || "";
  const analysisResult = state.analysisResult || "";

  try {
    const rawModel = LLMFactory.getModel({ temperature: 0.2 }) as any;
    const structuredModel = rawModel.withStructuredOutput(DecompositionSchema);

    const response = await structuredModel.invoke([
      new SystemMessage(
        `You are a task decomposition expert for an autonomous AI agent called MidpointX.
Break the user's goal into at most 12 concrete, ordered sub-tasks.
Worker roles:
- researcher: web research, reading documentation, scanning files
- developer: writing or editing code files
- tester: running tests, verifying builds, checking output
- executor: direct tool calls — file writes, shell commands, API calls (use this for simple single-step actions)

Use executor for any task completable with one tool call.
Only use researcher/developer/tester when the step needs multi-step cognitive work.

dependsOn: list the exact TITLES of tasks that must complete before this task starts.
Keep tasks focused and sequential. Avoid over-decomposing simple requests.`
      ),
      new HumanMessage(
        `User Goal: ${userIntent}\n\nAnalysis Context:\n${analysisResult}\n\nDecompose this into concrete sub-tasks.`
      ),
    ]);

    // Pre-assign UUIDs so we can resolve title-based dependsOn to IDs before writing to SQLite
    const titleToId: Record<string, string> = {};
    const withIds = response.tasks.map((t: z.infer<typeof GoalTaskSchema>) => {
      const id = crypto.randomUUID();
      titleToId[t.title] = id;
      return { ...t, id };
    });

    const taskInputs: CreateTaskInput[] = withIds.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dependsOn: t.dependsOn.map((depTitle: string) => titleToId[depTitle]).filter(Boolean) as string[],
      assignedWorker: t.assignedWorker as WorkerType,
    }));

    const goal = GoalTracker.createGoal(state.taskId, userIntent, taskInputs);

    const taskList = taskInputs.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
    TelegramService.sendMessage(
      `🎯 *New Goal:* ${userIntent}\n📋 *${taskInputs.length} steps planned:*\n${taskList}`
    ).catch(e => console.warn("[GoalDecomposer] Telegram send failed:", e.message));

    console.log(`✅ [GoalDecomposerActor] Created goal ${goal.id} with ${taskInputs.length} tasks`);
    return { activeGoalId: goal.id };

  } catch (err: any) {
    console.error("[GoalDecomposerActor] Decomposition failed, falling back to single-task plan:", err.message);

    const fallbackId = crypto.randomUUID();
    const goal = GoalTracker.createGoal(state.taskId, userIntent, [
      { id: fallbackId, title: userIntent, description: userIntent, dependsOn: [], assignedWorker: "executor" },
    ]);

    TelegramService.sendMessage(
      `⚠️ *Decomposition failed — running directly:* ${userIntent}`
    ).catch(() => {});

    return { activeGoalId: goal.id };
  }
}
