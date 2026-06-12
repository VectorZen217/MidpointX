import "dotenv/config";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MidpointXState, LogicShiftSchema, StrategicPlanSchema, StrategicPlan, LogicShift } from "../core/state";
import { 
  buildReflectPrompt,
  buildAnalyzePrompt,
  buildLearnPrompt,
} from "../core/prompt";
import { EnvironmentProbe } from "../core/environmentProbe";
import { LLMFactory } from "../core/llmFactory";
import { PluginRegistry } from "../core/pluginRegistry";
import { invokeWithResilience } from "../core/resilience";
import { WorkspaceLoader } from "../core/workspaceLoader";
import { MemoryManager } from "../core/memory";
import { A2AProtocol } from "../core/protocol";
import { z } from "zod";

/**
 * Wraps a promise with a timeout. If the promise doesn't settle within ms milliseconds,
 * resolves with the fallback value instead. Prevents hanging memory calls from blocking the cognitive loop.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
}

export const SilentAssessmentSchema = z.object({
  action: z.enum(["DROP", "NOTIFY", "ACTION"]),
  confidence: z.number().describe("0-100 score indicating confidence in taking autonomous action"),
  worker: z.string().describe("The name of the Cognitive Worker (Skill) to assign, if ACTION"),
  reasoning: z.string().describe("Why this action/drop/notify was chosen")
});

/**
 * NODE: SilentAssessmentActor
 * Proactively evaluates events without immediate user interaction.
 * Applies the 85% confidence threshold and DLQ routing.
 */
export async function silentAssessmentNode(state: typeof MidpointXState.State) {
  console.log("👁️ [SilentAssessmentActor] Evaluating proactive trigger...");

  if (!state.proactiveTrigger) {
     return {}; // Bypass if not a proactive trigger
  }

  const rawModel = LLMFactory.getModel({ temperature: 0.1, tier: "worker" }) as any;
  const structuredModel = rawModel.withStructuredOutput(SilentAssessmentSchema);

  const agentPersona = WorkspaceLoader.getAgentPersona();
  const availableSkills = PluginRegistry.getMDSkills().map(s => `[${s.name}]: ${s.description}`).join("\n");

  const content: any[] = [
    { 
      type: "text", 
      text: `
        PROACTIVE TRIGGER DETECTED:
        Trigger Type: ${state.proactiveTrigger.type}
        Skill Source: ${state.proactiveTrigger.skill}
        Event Data: ${JSON.stringify(state.proactiveTrigger.data)}
        
        Evaluate this event. Should MidpointX act on it, just notify the user, or drop it as noise?
        Available Workers:
        ${availableSkills}
      ` 
    }
  ];

  const payload = [
    new SystemMessage(`You are the Sentinel Assessment engine.\n${agentPersona}\nAnalyze the trigger. If you are extremely confident (>85%), select ACTION and assign a worker. If unsure, select NOTIFY. If the event is noise, select DROP.`),
    new HumanMessage({ content })
  ];

  let result = (await invokeWithResilience(structuredModel, payload)) as any;

  // Apply Anti-Blind Spot Strategy (85% Confidence Threshold)
  if (result.action === "ACTION" && result.confidence < 85) {
      console.log(`⚠️ [SilentAssessmentActor] Confidence (${result.confidence}%) below 85% threshold. Downgrading ACTION to NOTIFY.`);
      result.action = "NOTIFY";
      result.reasoning = `Confidence was only ${result.confidence}%. Action downgraded to Notification to prevent blind spots. Original reasoning: ${result.reasoning}`;
  }

  if (result.action === "DROP") {
      await MemoryManager.logDroppedEventToDLQ(state.proactiveTrigger, result.reasoning);
  }

  return A2AProtocol.commit("SilentAssessmentActor", { 
    assessmentDecision: result.action,
    assessmentReasoning: result.reasoning,
    assignedWorker: result.worker || "",
    totalInputTokens: 0,
    totalOutputTokens: 0,
    internalTurns: 1
  });
}

/**
 * Safely extracts plain text from LangChain response content.
 * Handles both simple strings and mixed-part arrays (e.g. Gemini thinking blocks).
 */
export function extractText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text ?? "")
      .join("");
  }
  return String(content);
}

export async function reflectNode(state: typeof MidpointXState.State) {
  console.log("🧠 [ReflectionActor] Analyzing intent...");
  console.log(`   Task: "${state.userIntent}"`);

  const model = LLMFactory.getModel({ temperature: 0.2, tier: "worker", maxTokens: 400 });

  const agentPersona = WorkspaceLoader.getAgentPersona();
  const userContext = WorkspaceLoader.getUserContext();

  // Recall relevant past sessions (last 7 days)
  const memoryContext = await withTimeout(
    MemoryManager.recallRecent(state.userIntent, 7),
    5000,
    ""
  );
  
  // Archive Search (Last Resort): If active library feels insufficient or mission seems novel
  let archiveContext = "";
  const activeSkills = PluginRegistry.getMDSkills();
  const activeSkillMatch = activeSkills.some(s => 
    state.userIntent.toLowerCase().includes(s.name.toLowerCase()) || 
    s.description.toLowerCase().split(", ").some(tag => state.userIntent.toLowerCase().includes(tag))
  );

  if (!activeSkillMatch || memoryContext.length < 50) {
    console.log("🔍 [ReflectionActor] Working memory sparse. Searching cold storage archive...");
    archiveContext = await withTimeout(
      MemoryManager.searchArchive(state.userIntent),
      5000,
      ""
    );
  }

  // FIX Bug1b: wrap recalled sessions with explicit label so downstream actors (SupervisorActor)
  // cannot mistake historical context for the current task being evaluated
  const memoryBlock = (memoryContext
    ? `\n\nHISTORICAL CONTEXT (past sessions — for reference only, NOT the current task):\n${memoryContext}\nEND HISTORICAL CONTEXT`
    : "") +
    (archiveContext ? `\n\nCOLD STORAGE MATCHES (ARCHIVED THEOREMS):\n${archiveContext}\n\nIf these archived patterns are relevant, adapt them into your strategy.` : "");

  const identityStr = state.operatorIdentity
    ? `\n\nCURRENT OPERATOR IDENTITY:\nName: ${state.operatorIdentity.name}\nEmail: ${state.operatorIdentity.email}\nUID: ${state.operatorIdentity.uid}`
    : '';

  const swarmStr = state.assignedWorker
    ? `\n\nCOGNITIVE WORKER SWARM ROUTING:\nYou have been assigned the worker role: [${state.assignedWorker}]. Focus EXCLUSIVELY on executing this mission within the boundaries of this specific worker skill.`
    : '';

  const content: any[] = [
    // FIX Bug1b: CURRENT TASK appears first and is labeled separately from historical context
    // so SupervisorActor cannot classify this session as a past sentinel event
    { type: "text", text: `CURRENT TASK (from user): ${state.userIntent}${memoryBlock}\n\nCritically reflect on the CURRENT TASK above. What are the hidden complexities, required system states, and potential failure points?` }
  ];

  if (state.highFidelityContext && state.highFidelityContext.length > 0) {
    console.log("🖼️ [ReflectionActor] Ingesting high-fidelity external context (User Uploads)...");
    state.highFidelityContext.forEach((base64: string) => {
      content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } });
    });
  }

  const payload = [
    new SystemMessage(buildReflectPrompt(agentPersona, userContext) + identityStr + swarmStr),
    new HumanMessage({ content } as any)
  ];

  const response = await invokeWithResilience(model, payload);

  const fullContent = extractText(response.content);

  // Extract the concise intent from the formatted response
  const coreIntentMatch = fullContent.match(/CONCISE INTENT: (.*)/i);
  const conciseIntent = coreIntentMatch
    ? coreIntentMatch[1].trim()
    : (fullContent?.split('\n')[0] ?? "").trim() || state.userIntent;

  if (memoryContext) {
    console.log(`🔮 [ReflectionActor] Injected ${memoryContext.split("##").length - 1} relevant past session(s) into context.`);
  }

  return A2AProtocol.commit("ReflectionActor", { 
    reflectionTrace: fullContent,
    conciseIntent: conciseIntent,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0,
    internalTurns: 1
  });
}

export const SwarmRoutingSchema = z.object({
  strategicPlan: z.array(z.string()).describe("A list of concrete, actionable steps to complete the task."),
  rationale: z.string().describe("Explanation of why this plan/routing was chosen."),
  assignedWorker: z.enum(["researcher", "developer", "tester", "none"]).describe("The specialized worker role assigned to the current step."),
  subGoal: z.string().describe("Specific goal or instructions for the assigned worker."),
  isTaskComplete: z.boolean().describe("True if all steps of the plan are fully executed and the overall task is complete."),
  skillGapQuery: z.string().optional().describe(
    "ONLY populate this when: (1) the current step has already failed at least once AND (2) no existing skill in the library covers the required domain. " +
    "Provide a concise, searchable web query (e.g. 'puppeteer download file nodejs') that will retrieve the missing knowledge. " +
    "Leave EMPTY if existing skills are sufficient or if this is the first attempt at the step."
  )
});

export type SwarmRouting = z.infer<typeof SwarmRoutingSchema>;

export async function supervisorNode(state: typeof MidpointXState.State) {
  console.log("👑 [SupervisorActor] Orchestrating cognitive swarm worker assignments...");

  const envFingerprint = state.environmentFingerprint || await EnvironmentProbe.scan();
  // maxTokens: 4096 — complex replanning with long action history can overflow the 8192 default
  const rawModel = LLMFactory.getModel({ temperature: 0.1, maxTokens: 4096 }) as any;
  const structuredModel = rawModel.withStructuredOutput(SwarmRoutingSchema);

  const agentPersona = WorkspaceLoader.getAgentPersona();
  const userContext = WorkspaceLoader.getUserContext();
  const availableTools = PluginRegistry.getActiveTools().map(t => t.name).join(", ");
  const skills = PluginRegistry.getMDSkills();
  const skillsStr = skills.length > 0 
    ? `\n\nLIBRARY OF REUSABLE SKILLS (THEOREMS):\n${skills.map(s => `[${s.name}]: ${s.description}`).join("\n")}`
    : '';

  const identityStr = state.operatorIdentity
    ? `\n\nCURRENT OPERATOR IDENTITY:\nName: ${state.operatorIdentity.name}\nEmail: ${state.operatorIdentity.email}\nUID: ${state.operatorIdentity.uid}`
    : '';

  const failureContext = state.failureThesis 
    ? `\n\n⚠️ RE-PLANNING CONTEXT: The previous execution failed. \nAGENT FAILURE THESIS: "${state.failureThesis}"\nAddress this failure in your plan and worker routing.` 
    : '';

  const activePlanStr = state.strategicPlan && state.strategicPlan.length > 0
    ? `\n\nACTIVE STRATEGIC PLAN:\n${state.strategicPlan.map((s, i) => `${i+1}. ${s} [${state.planStatus[s] || 'pending'}]`).join("\n")}`
    : '\n\nNo active plan exists. You must generate a new strategic plan.';

  const workerOutputsStr = state.workerOutput
    ? `\n\nLAST SWARM WORKER OUTPUT:\n${state.workerOutput}`
    : '';

  // Bug 2 fix: include recent tool execution results so the Supervisor can see
  // what actually ran and whether steps succeeded — without this it was blind
  // to all ExecutionActor output and would re-assign completed work.
  const recentToolOutputsStr = state.actionHistory && state.actionHistory.length > 0
    ? `\n\nRECENT TOOL EXECUTION RESULTS (last ${Math.min(state.actionHistory.length, 5)}):\n${
        state.actionHistory.slice(-5).map((h: any) => {
          const result = typeof h.result === 'string' ? h.result : JSON.stringify(h.result || "");
          return `[${h.tool}]: ${result.substring(0, 300)}${result.length > 300 ? '...' : ''}`;
        }).join("\n")
      }`
    : '';

  const content: any[] = [
    {
      type: "text",
      text: `
        Original Task: ${state.userIntent}
        Concise Intent: ${state.conciseIntent}
        ${failureContext}
        ${activePlanStr}
        ${workerOutputsStr}
        ${recentToolOutputsStr}
        Reflection Trace: ${state.reflectionTrace}
        ENVIRONMENTAL FINGERPRINT:
        ${JSON.stringify(envFingerprint, null, 2)}

        Evaluate the overall state and assign the next logical specialized worker role to move the task forward.
      `
    }
  ];

  if (state.currentScreenshot && state.currentScreenshot.length > 100) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${state.currentScreenshot}` }
    });
  }

  const payload = [
    new SystemMessage(
      `You are the MidpointX Swarm Supervisor/Architect.\n${agentPersona}\n${userContext}
Your mandate is to review the global task intent, create/maintain the strategic plan, evaluate progress, and assign sub-goals to specialized workers.
Worker Roles:
1. 'researcher': Gathering info, reading documentation, scanning files, and scraping.
2. 'developer': Writing code files, making surgical edits, refactoring.
3. 'tester': Compiling code, running linting tools, testing builds, verifying test suites.

CRITICAL TOOL EXECUTION ROUTING RULE:
- Specialized workers ('researcher', 'developer', 'tester') are pure-text cognitive nodes. They DO NOT have tool-execution capabilities. They only write reports, synthesize code, or design test procedures in text.
- If the next step in the plan requires calling a tool, executing a shell command, writing/editing/deleting a file, creating a directory, fetching a URL, or using a Google Workspace/MCP API, you MUST set 'assignedWorker' to 'none' and describe the tool task/goals in 'subGoal'.
- Setting 'assignedWorker' to 'none' will route the task to the tool execution layer (SelectionActor & ExecutionActor) to run the necessary tool.

SIMPLICITY RULE: For any task that can be answered or completed with a single tool call (e.g. "write a file", "check the time", "run a command", "search the web", "send a message"), set 'assignedWorker' to 'none' IMMEDIATELY and put the tool goal in 'subGoal'. Only assign a cognitive worker when the step genuinely requires multi-step text-based research or code synthesis that cannot be done by a tool directly. Never route a simple tool-executable step through a cognitive worker first.

COMPLETION DETECTION: Review 'RECENT TOOL EXECUTION RESULTS'. If those results confirm that all plan steps are fulfilled, set 'isTaskComplete' to true regardless of whether a cognitive worker has run.

Select the next worker, define their focused 'subGoal', and output the updated strategicPlan. If all plan goals are fully met, set 'isTaskComplete' to true and 'assignedWorker' to 'none'.` + identityStr + skillsStr
    ),
    new HumanMessage({ content })
  ];

  const response = await invokeWithResilience(structuredModel, payload) as SwarmRouting;

  // Sync planStatus Map
  const newPlanStatus = { ...state.planStatus };
  response.strategicPlan.forEach((step: string) => {
    if (!newPlanStatus[step]) {
      newPlanStatus[step] = 'pending';
    }
  });

  // If activeWorker just finished a step, let's mark it as completed
  if (state.workerSubGoal) {
    const matchingStep = response.strategicPlan.find(s => s.toLowerCase().includes(state.workerSubGoal.toLowerCase()) || state.workerSubGoal.toLowerCase().includes(s.toLowerCase()));
    if (matchingStep) {
      newPlanStatus[matchingStep] = 'completed';
    }
  }

  // ── Skill Gap Detection ─────────────────────────────────────────────────
  // The supervisor may declare a skill gap (reactive: only after ≥1 failure).
  // We honour it only when failureThesis is set (i.e. at least one tool call
  // has already failed), preventing unnecessary web calls on the happy path.
  const skillGapQuery = (response.skillGapQuery && state.failureThesis)
    ? response.skillGapQuery.trim()
    : "";

  if (skillGapQuery) {
    console.log(`🧠 [SupervisorActor] Skill gap detected. Query: "${skillGapQuery}"`);
  }

  // Detect cited skills
  const citedSkills: string[] = [];
  skills.forEach(skill => {
    if (response.rationale.includes(skill.name)) {
      citedSkills.push(skill.name);
    }
  });

  // Guard: if every step in the INCOMING plan is already completed/failed, the task is
  // done even if the LLM generated a new "confirmation" step. Overriding here prevents
  // the infinite Supervisor → SelectionActor → Supervisor loop.
  const existingPlanAllDone = (state.strategicPlan?.length ?? 0) > 0 &&
    state.strategicPlan.every(
      (step: string) => ['completed', 'failed'].includes(state.planStatus[step] ?? 'pending')
    );
  const effectiveIsTaskComplete = response.isTaskComplete || existingPlanAllDone;
  if (existingPlanAllDone && !response.isTaskComplete) {
    console.log("🏁 [SupervisorActor] All original plan steps completed. Overriding isTaskComplete -> true.");
  }

  console.log(`👑 [SupervisorActor] Step assigned: "${response.subGoal}" -> Role: [${response.assignedWorker}]`);

  return A2AProtocol.commit("SupervisorActor", {
    analysisResult: response.rationale,
    strategicPlan: response.strategicPlan,
    planStatus: newPlanStatus,
    activeWorker: response.assignedWorker,
    workerSubGoal: response.subGoal,
    isTaskComplete: effectiveIsTaskComplete,
    environmentFingerprint: envFingerprint,
    citedSkills: citedSkills,
    skillGapQuery: skillGapQuery,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    internalTurns: 1
  });
}

/**
 * NODE: AnalysisActor (Original lean strategy generator)
 * Ingests the EnvironmentProbe fingerprint and active tools to produce a
 * minimal, grounded strategic plan. Runs exactly once per mission start.
 * Does NOT orchestrate swarm workers — that is the SupervisorActor's job.
 * Keeping this lean is what preserves the original token-cost design.
 */
export async function analyzeNode(state: typeof MidpointXState.State) {
  console.log("🎯 [AnalysisActor] Building grounded execution strategy...");

  const envFingerprint = state.environmentFingerprint || await EnvironmentProbe.scan();
  // maxTokens: 2048 — worker default (512) truncates JSON for plans with >10 steps
  const rawModel = LLMFactory.getModel({ temperature: 0.1, tier: "worker", maxTokens: 2048 }) as any;
  const structuredModel = rawModel.withStructuredOutput(StrategicPlanSchema);

  const agentPersona = WorkspaceLoader.getAgentPersona();
  const userContext = WorkspaceLoader.getUserContext();
  const availableTools = PluginRegistry.getActiveTools().map(t => t.name).join(", ");
  const skills = PluginRegistry.getMDSkills();
  const skillsStr = skills.length > 0
    ? `\n\nREUSABLE SKILLS:\n${skills.map(s => `[${s.name}]: ${s.description}`).join("\n")}`
    : '';
  const failureContext = state.failureThesis
    ? `\n\n⚠️ PREVIOUS FAILURE: ${state.failureThesis}\nRevise the plan to avoid this failure mode.`
    : '';

  const payload = [
    new SystemMessage(buildAnalyzePrompt(agentPersona, userContext, state.executionMode || 'api') + skillsStr),
    new HumanMessage(`
Task: ${state.userIntent}
Reflection: ${state.reflectionTrace}
${failureContext}
Available tools: ${availableTools}

ENVIRONMENTAL FINGERPRINT:
${JSON.stringify(envFingerprint, null, 2)}

Produce a minimal, tool-grounded plan. For simple or single-step tasks, 1–2 steps is ideal. Each step must map directly to an available tool or command.
    `)
  ];

  const response = await invokeWithResilience(structuredModel, payload) as StrategicPlan;

  // All steps start as pending; SelectionActor and ExecutionActor drive completion
  const newPlanStatus: Record<string, 'pending' | 'active' | 'completed' | 'failed'> = {};
  response.plan.forEach((step: string) => { newPlanStatus[step] = 'pending'; });

  return A2AProtocol.commit("AnalysisActor", {
    analysisResult: response.rationale,
    strategicPlan: response.plan,
    planStatus: newPlanStatus,
    activeWorker: "none",
    workerSubGoal: state.conciseIntent,
    isTaskComplete: false,
    skillGapQuery: "",
    environmentFingerprint: envFingerprint,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    internalTurns: 1
  });
}

/**
 * NODE: SummarizeActor
 * Distills old actions into a rolling progress summary to save context window.
 */
export async function summarizeNode(state: typeof MidpointXState.State) {
  // Only trigger if history is becoming a burden
  if (state.actionHistory.length <= 15) return {};

  console.log("✂️ [SummarizeActor] Pruning history and updating milestone summary...");
  const model = LLMFactory.getModel({ temperature: 0, tier: "worker", maxTokens: 300 });

  const toSummarize = state.actionHistory.slice(0, 5);
  const remainingHistory = state.actionHistory.slice(5);

  const historyStr = toSummarize.map((h: any, i: number) => `${i+1}. Action: ${h.tool} -> Result: ${h.result}`).join("\n");
  
  const payload = [
    new SystemMessage("You are a high-fidelity summarizer. Distill the following agent actions into a single, comprehensive progress statement that preserves the original intent and key achievements. Do not lose vital state information (like 'user is logged in')."),
    new HumanMessage(`Current Intent: ${state.conciseIntent}\nExisting Summary: ${state.historySummary}\n\nActions to compress:\n${historyStr}`)
  ];

  const response = await invokeWithResilience(model, payload);
  const newSummary = extractText(response.content);

  return A2AProtocol.commit("SummarizeActor", {
    actionHistory: remainingHistory,
    historySummary: newSummary,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0
  });
}

export async function learnNode(state: typeof MidpointXState.State) {
  // [SECURITY]: If the task failed or was incomplete, skip learning to prevent flawed logic shifts
  if (!state.isTaskComplete || (state.failureThesis && state.failureThesis.length > 0)) {
    console.log("⏩ [LearnActor] Task failed or incomplete. Skipping logic shift analysis.");
    return A2AProtocol.commit("LearnActor", { 
      proposedShift: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      internalTurns: 1
    });
  }

  console.log("💡 [LearnActor] Evaluating for novel theorems...");

  const rawModel = LLMFactory.getModel({ temperature: 0.4, tier: "worker" }) as unknown as BaseChatModel;
  const structuredModel = rawModel.withStructuredOutput(LogicShiftSchema);

  const agentPersona = WorkspaceLoader.getAgentPersona();
  const userContext = WorkspaceLoader.getUserContext();

  const identityStr = state.operatorIdentity
    ? `\n\nCURRENT OPERATOR IDENTITY:\nName: ${state.operatorIdentity.name}\nEmail: ${state.operatorIdentity.email}\nUID: ${state.operatorIdentity.uid}`
    : '';

  const payload = [
    new SystemMessage(buildLearnPrompt(agentPersona, userContext) + identityStr),
    new HumanMessage(`
      MISSION RECAP:
      Original Task: ${state.userIntent}
      Strategy Used: ${state.analysisResult}
      Task Completed Successfully: ${state.isTaskComplete}
      
      FINAL OUTCOME:
      ${state.finalOutcome}

      TEMPORAL OBSERVATION:
      ${state.temporalInsight || "No temporal change detected."}

      CRITICAL EVALUATION:
      Did this specific mission require a novel approach that should be codified for future use? 
      Only propose a Logic Shift if the task was successful AND the approach is reusable.
    `)
  ];

  const response = await invokeWithResilience(structuredModel, payload);

  const proposedShift = response?.theoremId && response.theoremId !== "null" && response.theoremId.length > 3
    ? response 
    : null;

  if (proposedShift) {
    console.log(`✨ [LearnActor] Novel logic shift proposed: ${proposedShift.theoremId}`);
  } else {
    console.log("⏩ [LearnActor] Standard task. No new logic required.");
  }

  // Update statistics for all cited skills based on the mission outcome
  if (state.citedSkills && state.citedSkills.length > 0) {
    await MemoryManager.updateSkillStats(state.citedSkills, !!state.isTaskComplete);

    // Reactivation Loop: If an archived skill led to success, bring it back to active memory
    if (state.isTaskComplete) {
      const activeSkills = PluginRegistry.getMDSkills().map(s => s.name);
      for (const skillName of state.citedSkills) {
        if (!activeSkills.includes(skillName)) {
          console.log(`✨ [LearnActor] Mission success using archived theorem [${skillName}]. Reactivating...`);
          await MemoryManager.reactivateSkill(skillName);
        }
      }
    }
  }

  return A2AProtocol.commit("LearnActor", { 
    proposedShift: proposedShift as LogicShift | null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    internalTurns: 1
  });
}
