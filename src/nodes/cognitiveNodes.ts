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
  const memoryContext = await MemoryManager.recallRecent(state.userIntent, 7);
  
  // Archive Search (Last Resort): If active library feels insufficient or mission seems novel
  let archiveContext = "";
  const activeSkills = PluginRegistry.getMDSkills();
  const activeSkillMatch = activeSkills.some(s => 
    state.userIntent.toLowerCase().includes(s.name.toLowerCase()) || 
    s.description.toLowerCase().split(", ").some(tag => state.userIntent.toLowerCase().includes(tag))
  );

  if (!activeSkillMatch || memoryContext.length < 50) {
    console.log("🔍 [ReflectionActor] Working memory sparse. Searching cold storage archive...");
    archiveContext = await MemoryManager.searchArchive(state.userIntent);
  }

  const memoryBlock = (memoryContext ? `\n\n${memoryContext}` : "") + 
                      (archiveContext ? `\n\nCOLD STORAGE MATCHES (ARCHIVED THEOREMS):\n${archiveContext}\n\nIf these archived patterns are relevant, adapt them into your strategy.` : "");

  const identityStr = state.operatorIdentity
    ? `\n\nCURRENT OPERATOR IDENTITY:\nName: ${state.operatorIdentity.name}\nEmail: ${state.operatorIdentity.email}\nUID: ${state.operatorIdentity.uid}`
    : '';

  const swarmStr = state.assignedWorker
    ? `\n\nCOGNITIVE WORKER SWARM ROUTING:\nYou have been assigned the worker role: [${state.assignedWorker}]. Focus EXCLUSIVELY on executing this mission within the boundaries of this specific worker skill.`
    : '';

  const content: any[] = [
    { type: "text", text: `Task Intent: ${state.userIntent}${memoryBlock}\n\nCritically reflect on this task. What are the hidden complexities, required system states, and potential failure points?` }
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
  const conciseIntent = coreIntentMatch ? coreIntentMatch[1].trim() : fullContent.split('\n')[0].trim();

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

export async function analyzeNode(state: typeof MidpointXState.State) {
  console.log("🔍 [AnalysisActor] Mapping strategy...");

  const envFingerprint = state.environmentFingerprint || await EnvironmentProbe.scan();
  const rawModel = LLMFactory.getModel({ temperature: 0.1 }) as any;
  const structuredModel = rawModel.withStructuredOutput(StrategicPlanSchema);

  const agentPersona = WorkspaceLoader.getAgentPersona();
  const userContext = WorkspaceLoader.getUserContext();
  const availableTools = PluginRegistry.getActiveTools().map(t => t.name).join(", ");
  const skills = PluginRegistry.getMDSkills();
  const skillsStr = skills.length > 0 
    ? `\n\nLIBRARY OF REUSABLE SKILLS (THEOREMS):\n${skills.map(s => `[${s.name}]: ${s.description}`).join("\n")}\n\nIf any of these skills are relevant to the mission, cite them in your rationale and use their patterns in the plan.`
    : '';

  const identityStr = state.operatorIdentity
    ? `\n\nCURRENT OPERATOR IDENTITY:\nName: ${state.operatorIdentity.name}\nEmail: ${state.operatorIdentity.email}\nUID: ${state.operatorIdentity.uid}`
    : '';

  const failureContext = state.failureThesis 
    ? `\n\n⚠️ RE-PLANNING CONTEXT: The previous plan failed. \nAGENT FAILURE THESIS: "${state.failureThesis}"\n\nYour new plan MUST address this failure and avoid the same pitfalls.` 
    : '';

  const content: any[] = [
    { 
      type: "text", 
      text: `
        Original Task: ${state.userIntent}
        Concise Intent: ${state.conciseIntent}
        ${failureContext}
        Reflection Trace: ${state.reflectionTrace}
        ENVIRONMENTAL FINGERPRINT:
        ${JSON.stringify(envFingerprint, null, 2)}
        
        Generate a structured strategic plan for this mission.
      ` 
    }
  ];

  // Ingest high-fidelity context (User uploads)
  if (state.highFidelityContext && state.highFidelityContext.length > 0) {
    state.highFidelityContext.forEach((base64: string) => {
      content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } });
    });
  }

  // Vision Integration: If we have a screenshot, attach it to the analysis context
  if (state.currentScreenshot && state.currentScreenshot.length > 100) {
    console.log("📸 [AnalysisActor] Attaching visual context to strategy mapping.");
    content.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${state.currentScreenshot}` }
    });
  }

  const payload = [
    new SystemMessage(
      buildAnalyzePrompt(agentPersona, userContext, state.executionMode || 'api') + identityStr +
      (state.assignedWorker ? `\n\nSWARM DIRECTIVE: You are acting as worker [${state.assignedWorker}]. Restrict your strategy to this domain.` : '') +
      `\n\nTOOL CONTEXT: Available tools: [${availableTools}]` +
      skillsStr
    ),
    new HumanMessage({ content })
  ];

  const response = await invokeWithResilience(structuredModel, payload) as StrategicPlan;

  // Initialize plan status
  const planStatus: Record<string, 'pending' | 'completed' | 'failed'> = {};
  response.plan.forEach((step: string) => {
    planStatus[step] = 'pending';
  });

  // Citation detection: Detect which skills were mentioned in the rationale
  const citedSkills: string[] = [];
  skills.forEach(skill => {
    if (response.rationale.includes(skill.name)) {
      citedSkills.push(skill.name);
    }
  });

  if (citedSkills.length > 0) {
    console.log(`🎯 [AnalysisActor] Cited ${citedSkills.length} skill(s): ${citedSkills.join(", ")}`);
  }

  return A2AProtocol.commit("AnalysisActor", { 
    analysisResult: response.rationale,
    strategicPlan: response.plan,
    planStatus: planStatus,
    environmentFingerprint: envFingerprint,
    citedSkills: citedSkills,
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
