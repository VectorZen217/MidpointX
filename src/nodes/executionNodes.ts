import "dotenv/config";
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { MidpointXState } from "../core/state";
import { buildActionPrompt, buildMemoryContextBlockAsync } from "../core/prompt";
import { extractText } from "./cognitiveNodes";
import { PluginRegistry } from "../core/pluginRegistry";
import { LLMFactory } from "../core/llmFactory";
import { invokeWithResilience } from "../core/resilience";
import { WorkspaceLoader } from "../core/workspaceLoader";
import { MemoryManager } from "../core/memory";
import { ScreenCapture } from "../plugins/desktop/ScreenCapture";
import { Config } from "../core/config";
import { A2AProtocol } from "../core/protocol";
import { SandboxManager } from "../core/sandboxManager";
import { PolicyEngine } from "../core/policy";
import { CacheManager } from "../core/cacheManager";

const execAsync = promisify(exec);

/**
 * Wraps a promise with a timeout. If the promise doesn't settle within ms milliseconds,
 * resolves with the fallback value instead. Prevents hanging memory calls from blocking execution.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
}

/**
 * Helper to truncate long shell outputs (middle-out) with hard character caps
 */
// Hard cap for every stored action result (non-snapshot). Keeps context window under control.
const OUTPUT_HARD_CAP = 1500;

/**
 * Strips ANSI escape codes, collapses blank lines, and normalizes whitespaces.
 */
const sanitizeOutput = (output: string): string => {
  if (!output) return "";
  // 1. Remove ANSI escape codes
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  let clean = output.replace(ansiRegex, "");

  // 2. Collapse carriage returns
  clean = clean.replace(/\r/g, "");

  // 3. Collapse multiple consecutive empty lines to a single empty line
  clean = clean.replace(/\n{3,}/g, "\n\n");

  return clean.trim();
};

const truncateOutput = (output: string, maxLines = 30, maxChars = OUTPUT_HARD_CAP): string => {
  const sanitized = sanitizeOutput(output);
  const lines = sanitized.split('\n');
  let truncatedByLines = sanitized;
  
  if (lines.length > maxLines) {
    const half = Math.floor(maxLines / 2);
    const head = lines.slice(0, half).join('\n');
    const tail = lines.slice(-half).join('\n');
    truncatedByLines = `${head}\n\n... [TRUNCATED ${lines.length - maxLines} LINES] ...\n\n${tail}`;
  }

  if (truncatedByLines.length <= maxChars) return truncatedByLines;

  const charHalf = Math.floor(maxChars / 2);
  const headChars = truncatedByLines.substring(0, charHalf);
  const tailChars = truncatedByLines.substring(truncatedByLines.length - charHalf);
  
  return `${headChars}\n\n... [TRUNCATED ${truncatedByLines.length - maxChars} CHARS] ...\n\n${tailChars}`;
};

/**
 * Structured Fault Protocol — The Soul's error doctrine.
 * Every failure is reported as FAULT → CONSTRAINT → FIX.
 */
function formatFault(tool: string, error: string, constraint?: string, fix?: string): string {
  const c = constraint || "Underlying system or logic constraint.";
  const f = fix || "Identify alternative tool or escalate.";
  return `FAULT: ${tool} — ${error}\nCONSTRAINT: ${c}\nFIX: ${f}`;
}

/**
 * Security: Identifies actions that could modify the system or data.
 * Now uses the centralized PolicyEngine for "Lead Shielding".
 * Returns the severity level for the Agency Circuit Breaker.
 */
function getActionSeverity(toolName: string, args: any): 'undoable' | 'destructive' | null {
  const policyViolation = PolicyEngine.evaluateAction(toolName, args);
  
  if (policyViolation) {
    console.warn(`🛡️ [Security] Hard Policy Trigger: ${policyViolation}`);
    return 'destructive'; // Requires explicit approval
  }

  // Fallback to explicit list for non-path based tools
  const destructiveTools = [
    "filesystem__delete_file",
    "mcp_GitKraken_git_push",
    "mcp_GitKraken_git_add_or_commit"
  ];

  if (destructiveTools.includes(toolName)) {
    return 'destructive';
  }

  // Smart classification for execute_system_command:
  // Read-only commands (web fetches, directory listings, etc.) are safe.
    if (toolName === "execute_system_command" && args?.command) {
      const cmd = String(args.command).trim().toLowerCase();
      const readOnlyPatterns = [
        /invoke-webrequest/,                          // Direct Invoke-WebRequest
        /^\$progresspreference.*invoke-webrequest/,   // PowerShell web fetch
        /^curl\s/,                                    // curl
        /^wget\s/,                                    // wget
        /^get-content\s/,                              // Read file
        /^type\s/,                                     // Windows type
        /^cat\s/,                                      // cat
        /^dir\s/,                                      // dir listing
        /^ls\s/,                                       // ls listing
        /^get-childitem/,                              // PowerShell dir
      ];
      if (readOnlyPatterns.some(p => p.test(cmd))) {
        return null; // Safe, no approval needed
      }
      return 'undoable';
    }

  // Write tools that don't violate policies are 'undoable' (30-sec window)
  const writeTools = [
    "filesystem__write_text_file"
  ];

  if (writeTools.includes(toolName)) {
    return 'undoable';
  }

  // Pure read/notify
  return null;
}

// Proxy tool for LLM to select system commands
// @ts-ignore TS2589: LangChain tool() hits TS5.8+ instantiation depth limit
const executeSystemCommand = (tool(
  async () => "Proxy",
  {
    name: "execute_system_command",
    description: "Executes an authorized system command or API call on behalf of the user.",
    schema: z.object({
      command: z.string().describe("The raw command to execute."),
      workingDirectory: z.string().optional().describe("Directory to execute in.")
    })
  }
)) as any;

function sanitizeGeminiSchema(schema: any): any {
  if (schema === null || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  const clean = { ...schema };
  delete clean.exclusiveMinimum;
  delete clean.exclusiveMaximum;
  for (const key in clean) { clean[key] = sanitizeGeminiSchema(clean[key]); }
  return clean;
}

function minifyToolSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const pruned: any = { ...schema };
  delete pruned.title; delete pruned.examples; delete pruned.format; delete pruned.$schema;
  if (pruned.properties) {
    for (const key in pruned.properties) {
      pruned.properties[key] = minifyToolSchema(pruned.properties[key]);
      if (pruned.properties[key].description && pruned.properties[key].description.length > 150) {
        pruned.properties[key].description = pruned.properties[key].description.substring(0, 150) + "...";
      }
    }
  }
  return pruned;
}

/**
 * NODE 7a: SelectionActor
 * Decides which tool to call and flags if it needs approval.
 */
export async function selectionActor(state: typeof MidpointXState.State) {
  console.log("⚡ [SelectionActor] Analyzing next logical step...");

  // ═══════════════════════════════════════════════════════════════
  // TURN BUDGET ENFORCEMENT: Hard ceiling per mission.
  // Prevents runaway 24h+ tasks from consuming unbounded resources.
  // ═══════════════════════════════════════════════════════════════
  const turnsUsed = state.internalTurns || 0;
  const turnBudget = Config.MAX_TURNS_PER_MISSION;
  if (turnsUsed >= turnBudget) {
    console.warn(`⏱️ [SelectionActor] TURN BUDGET EXHAUSTED: ${turnsUsed}/${turnBudget} turns. Forcing mission completion.`);
    const toolsUsed = [...new Set(state.actionHistory.map((h: any) => h.tool))].join(", ");
    return A2AProtocol.commit("SelectionActor", {
      isTaskComplete: true,
      finalOutcome: `Mission halted after ${turnsUsed} turns (budget: ${turnBudget}). Progress summary: ${state.historySummary || state.analysisResult || "Task was underway."}\n\nTools used: ${toolsUsed}\n\nTo continue this task, restart with a more specific sub-goal.`,
      pendingAction: null,
      needsApproval: false,
    });
  }

  // LIFO Pruning: Clear raw visual buffer and transfer context to text-based insight
  const prunedState = {
    visualBuffer: [],
    temporalInsight: state.temporalInsight // Persist the insight, clear the frames
  };

  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  const strategy = (state.analysisResult || "").toLowerCase();
  const mission = (state.conciseIntent || state.userIntent || "").toLowerCase();
  const context = strategy + " " + mission;

  // 1. Tool Profile Filtering (Phase 4)
  const profile = Config.TOOL_PROFILE;
  const executionMode = state.executionMode || 'api';
  const activeTools = PluginRegistry.getActiveTools().filter(t => {
    if (!t.name) return false;
    
    // Global security filter based on profile
    if (profile === "messaging") {
      // In messaging mode, we block destructive shell and git operations
      if (t.name === "execute_system_command") return false;
      if (t.name.startsWith("mcp_GitKraken")) return false;
      if (t.name === "filesystem__write_text_file") return false;
    }

    // ═══════════════════════════════════════════════════════════════
    // EXECUTION MODE ENFORCEMENT — Hard tool-level gating
    // ═══════════════════════════════════════════════════════════════
    if (executionMode === "api") {
      // API MODE: The agent operates entirely in the background.
      // Desktop tools are FORBIDDEN — they require physical screen interaction (nut.js).
      // Browser tools ARE allowed because they use headless Puppeteer.
      if (t.name!.startsWith("desktop__")) return false;
    }

    if (executionMode === "visual") {
      // VISUAL MODE: The agent operates as a physical human at a desk.
      // Block background MCP APIs that bypass the UI — the agent must
      // interact through the browser/desktop like a human would.
      const blockedVisualPrefixes = [
        "gmail",
        "google-calendar",
        "google-drive",
        "github",
        "fetch"
      ];
      if (t.name && blockedVisualPrefixes.some(prefix => t.name!.startsWith(prefix))) {
        return false;
      }
    }

    return true; 
  });

  const cappedTools = activeTools.slice(0, 150); // Increased cap to allow full system access with all MCP servers

  const toolsToBind = [];
  if (profile !== "messaging") toolsToBind.push(executeSystemCommand);
  toolsToBind.push(...cappedTools.map(t => ({
    type: "function",
    function: {
      name: t.name as string,
      description: t.description,
      parameters: minifyToolSchema(sanitizeGeminiSchema(t.parameters || { type: "object", properties: {} }))
    }
  })));

  const isCacheActive = !!CacheManager.getActiveCacheId();
  const modelWithTools = isCacheActive 
    ? model 
    : (model as unknown as BaseChatModel).bindTools!(toolsToBind);

  const agentPersona = WorkspaceLoader.getAgentPersona();
  const userContext = WorkspaceLoader.getUserContext();
  
  // 2. Visual Throttling (Phase 4): Only use "Eyes" when necessary
  let currentScreenshot = "";
  if (Config.ENABLE_SCREENSHOTS) {
    const isFirstTurn = state.internalTurns === 0;
    
    // Check if the agent explicitly requested a snapshot in the previous turn
    const lastAction = state.actionHistory?.[state.actionHistory.length - 1];
    const explicitSnapshot = lastAction && (lastAction.tool === "desktop__take_snapshot" || lastAction.tool === "browser__screenshot");

    // Always look on turn 1 to get bearings
    if (isFirstTurn) {
      console.log("👁️ [SelectionActor] Initial visual grounding (Turn 1)...");
      try {
        currentScreenshot = await ScreenCapture.captureBase64();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("⚠️ [SelectionActor] Screenshot capture failed (non-fatal):", msg);
        currentScreenshot = "";
      }
    } else if (explicitSnapshot) {
      console.log("👁️ [SelectionActor] Manual visual sync detected in history.");
      // The snapshot data is stored in the action history result
      try {
          const resultObj = JSON.parse(lastAction.result);
          currentScreenshot = resultObj.output?.fullBase64 || resultObj.output?.snapshot || "";
      } catch (e) {
          console.warn("⚠️ [SelectionActor] Failed to extract manual snapshot from history.");
      }
    } else {
      console.log("🙈 [SelectionActor] Eyes IDLE (Awaiting manual request or internal logic phase)");
    }
  }
  
  const isValidScreenshot = currentScreenshot && currentScreenshot.length > 100;
  const planStr = state.strategicPlan.map((step: string, i: number) => `${i+1}. [${state.planStatus[step] || 'pending'}] ${step}`).join("\n");

  const historySummary = state.historySummary ? `\n\n[MILESTONE SUMMARY]:\n${state.historySummary}` : "";
  const temporalContext = state.temporalInsight ? `\n\n[TEMPORAL OBSERVATION]:\n${state.temporalInsight}` : "";
  
  const messageContent: any[] = [
    { type: "text", text: `Core Mission: ${state.conciseIntent || state.userIntent}\nStrategy: ${state.analysisResult}${historySummary}${temporalContext}\n\nPLAN:\n${planStr}\n\nCRITICAL INSTRUCTION: Before selecting a tool, EXAMINE YOUR ACTION HISTORY ABOVE. If any previous tool call already returned the data you need to answer the user's question, DO NOT call another tool. Instead, return NO tool call and provide the synthesized answer as your text content. Only call a new tool if the data is genuinely missing from your history.\n\nReview history and plan. Pick the next tool OR synthesize a final answer.` }
  ];
  if (isValidScreenshot) messageContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${currentScreenshot}` } });

  const historyMessages: any[] = [];
  // Start with the initial mission as the first Human Message
  historyMessages.push(new HumanMessage(`Initial Task: ${state.conciseIntent || state.userIntent}`));

  state.actionHistory.forEach((h: any, idx: number) => {
    historyMessages.push(new AIMessage({
      content: "",
      tool_calls: [{ name: h.tool, args: h.args, id: `call_h_${idx}` }]
    }));
    historyMessages.push(new ToolMessage({
      tool_call_id: `call_h_${idx}`,
      content: h.result
    }));
    // After every tool result, we need a Human message (observation) to bridge to the next turn
    historyMessages.push(new HumanMessage("Reviewing result..."));
  });

  // 3. Loop Detection & Strategy Guidance (Phase 4)
  // ═══════════════════════════════════════════════════════════════
  // STRUCTURED FAILURE DETECTION: Parse the JSON status field instead
  // of doing broad string matching. This prevents false positives like
  // "Error count: 0" in a successful server_info response.
  // ═══════════════════════════════════════════════════════════════
  const recentActions = state.actionHistory.slice(-5);
  const recentFailures = recentActions.filter((h: any) => {
    // 1. Try structured check first (most reliable)
    try {
      const parsed = JSON.parse(h.result);
      if (parsed.status === "error") return true;
      if (parsed.isError === true) return true;
    } catch {
      // Not JSON — fall through to string heuristics
    }
    // 2. Unambiguous failure markers (string fallback for non-JSON results)
    const r = h.result || "";
    if (r.includes("PAGE_LOAD_FAILED")) return true;
    if (r.includes("robots.txt")) return true;
    if (r.includes("REJECTED BY USER")) return true;
    if (r.includes("execution failed")) return true;
    // 3. Do NOT flag generic "Error" — it causes false positives on
    //    successful responses that mention error counts, error logs, etc.
    return false;
  });

  if (recentFailures.length >= 5) {
    console.error("🚨 [SelectionActor] HARD ABORT: 5 consecutive failures detected. Terminating execution loop to prevent token waste.");
    return A2AProtocol.commit("SelectionActor", {
      isTaskComplete: true,
      failureThesis: "I have failed 5 consecutive times and am stuck in a failure loop. I am aborting execution to prevent wasting resources. Please review my action history and provide guidance.",
      pendingAction: null,
      needsApproval: false,
      currentScreenshot,
      ...prunedState
    });
  }

  if (recentFailures.length >= 2) {
    console.warn("🔄 [SelectionActor] Failure loop detected. Injecting strategy correction...");
    
    if (executionMode === "api") {
      // API MODE: No browser/desktop tools exist. Guide toward PowerShell fallback.
      const fetchWasBlocked = recentActions.some((h: any) => h.result.includes("robots.txt"));
      messageContent[0].text += `\n\n[CRITICAL WARNING]: Your previous ${recentFailures.length} API attempts have failed. Do NOT repeat the same URL or tool.
MANDATORY RECOVERY (USE IN ORDER):
1. ${fetchWasBlocked ? "fetch__fetch was BLOCKED by robots.txt. You MUST use " : "Try "}'execute_system_command' with PowerShell:
   { command: "Invoke-WebRequest -Uri 'https://html.duckduckgo.com/html/?q=YOUR+SEARCH+TERMS' -UseBasicParsing | Select-Object -ExpandProperty Content" }
2. Try fetching specific marketplace/dealer sites directly (cycletrader.com, craigslist.org).
3. If ALL approaches fail, call 'system__request_replanning' to escalate to Visual Mode.
NEVER tell the user to do it manually. You have execute_system_command — USE IT.`;
    } else {
      // VISUAL MODE: Guide toward physical interaction
      const recentSnapshots = recentActions.filter((h: any) => h.tool === "desktop__take_snapshot" || h.tool === "browser__screenshot");
      if (recentSnapshots.length >= 1) {
        messageContent[0].text += `\n\n[CRITICAL WARNING]: You have already taken ${recentSnapshots.length} screenshot(s). You can SEE the screen. STOP taking screenshots. You MUST now ACT on what you see:
1. Identify the URL bar, search box, or key UI element from your last screenshot.
2. Use 'desktop__mouse_move' to move to that element's coordinates.
3. Use 'desktop__mouse_click' to click it.
4. Use 'desktop__keyboard_type' to type your search query.
5. Use 'desktop__keyboard_press' with key 'ENTER' to submit.
Do NOT call 'desktop__take_snapshot' again until AFTER you have performed a physical action.`;
      } else {
        messageContent[0].text += `\n\n[CRITICAL WARNING]: Your previous ${recentFailures.length} attempts have failed. Switch to manual interaction NOW:
1. Call 'desktop__take_snapshot' to see the current screen state.
2. Then use 'desktop__mouse_move', 'desktop__mouse_click', 'desktop__keyboard_type' to interact manually.`;
      }
    }
  }
  
  // 4. Persona Enforcement: Reinforce "No Filler" in the final synthesis turn
  const personaEnforcement = `\n\n## PERSONA ENFORCEMENT [MANDATORY]
- NO FILLER: Do not apologize, hedge, or use conversational fluff.
- TERSE COMPLETION: If you have the answer, state it directly and stop.
- CHANNEL AWARENESS: On Telegram/Discord, keep it extremely mobile-friendly.`;
  messageContent[0].text += personaEnforcement;

  const agentMemoryBlock = await withTimeout(
    buildMemoryContextBlockAsync(state.conciseIntent || state.userIntent || ""),
    3000,
    ""
  );

  const payload = [];
  if (!isCacheActive) {
    let systemPromptText = buildActionPrompt(agentPersona, userContext, state.executionMode || 'api', agentMemoryBlock);

    // Auto-inject EXECUTION_GUARD when 2+ plan steps are pending so the agent
    // always has execution discipline scaffolding without needing to call system__read_skill.
    const pendingSteps = state.strategicPlan.filter(
      (step: string) => (state.planStatus[step] || "pending") === "pending"
    );
    if (pendingSteps.length >= 2) {
      const guard = PluginRegistry.getSkillContent("EXECUTION_GUARD");
      if (guard) {
        systemPromptText = `<skill name="EXECUTION_GUARD">\n${guard}\n</skill>\n\n` + systemPromptText;
        console.log("🛡️ [SelectionActor] EXECUTION_GUARD injected into system prompt.");
      }
    }

    payload.push(new SystemMessage(systemPromptText));
  }
  payload.push(...historyMessages);
  payload.push(new HumanMessage({ content: messageContent } as any));

  const response = await invokeWithResilience(modelWithTools, payload);
  const toolCall = response.tool_calls?.[0];

  if (!toolCall) {
    const outcome = extractText(response.content);
    
    // Mark the current step as completed. If a step was promoted to 'active' in the
    // tool-call path this turn, use that. Otherwise mark the first 'pending' step —
    // this handles text-only steps assigned by Supervisor that never go through the
    // tool-call path and would otherwise stay 'pending' forever, causing an infinite loop.
    const updatedPlanStatus = { ...state.planStatus };
    const currentPlan = state.strategicPlan || [];
    const activeStep = currentPlan.find((step: string) => updatedPlanStatus[step] === 'active');
    const stepToComplete = activeStep ?? currentPlan.find((step: string) => updatedPlanStatus[step] === 'pending');
    if (stepToComplete) {
      updatedPlanStatus[stepToComplete] = 'completed';
    }
    
    // Check if there are still pending steps in the strategic plan
    const hasPendingSteps = currentPlan.some((step: string) => updatedPlanStatus[step] === 'pending');
    
    if (hasPendingSteps) {
      console.log("🔄 [SelectionActor] Step completed. Plan has pending steps. Routing back to Supervisor...");
      return A2AProtocol.commit("SelectionActor", {
        isTaskComplete: false,
        pendingAction: null,
        needsApproval: false,
        currentScreenshot,
        planStatus: updatedPlanStatus,
        ...prunedState
      });
    }

    console.log("🏁 [SelectionActor] No tool call detected. Mission concluding...");
    return A2AProtocol.commit("SelectionActor", { 
      isTaskComplete: true, 
      finalOutcome: outcome && outcome.trim().length > 5 ? outcome : "Done. All planned steps verified and completed.",
      pendingAction: null,
      needsApproval: false,
      currentScreenshot,
      planStatus: updatedPlanStatus,
      ...prunedState
    });
  }

  const isReplanRequested = toolCall?.name === "system__request_replanning";
  const replanCount = state.replanCount || 0;

  // ═══════════════════════════════════════════════════════════════
  // FETCH INTERCEPT: If the LLM chose fetch__fetch but fetch has
  // EVER failed with robots.txt in this session, auto-convert to
  // execute_system_command with Invoke-WebRequest. This prevents
  // the agent from wasting turns on a tool that will never work.
  // ═══════════════════════════════════════════════════════════════
  if (toolCall?.name === "fetch__fetch" && state.actionHistory?.length > 0) {
    const fetchEverBlocked = state.actionHistory.some(
      (h: any) => h.tool === "fetch__fetch" && h.result && h.result.includes("robots.txt")
    );
    if (fetchEverBlocked) {
      const fetchUrl = toolCall.args?.url || "";
      console.warn(`🔄 [SelectionActor] FETCH INTERCEPT: fetch__fetch was previously blocked by robots.txt. Auto-converting to PowerShell Invoke-WebRequest for: ${fetchUrl}`);
      toolCall.name = "execute_system_command";
      const safeUrl = fetchUrl.replace(/'/g, "''");
      toolCall.args = {
        command: `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${safeUrl}' -UseBasicParsing | Select-Object -ExpandProperty Content`
      };
    }
  }
  
  const severity = getActionSeverity(toolCall?.name, toolCall?.args);
  // Autonomous mode: skip approval gate ONLY when Docker is confirmed available.
  // isDockerAvailable() is cached after first call so this is a fast path.
  const dockerConfirmed = Config.USE_DOCKER_SANDBOX && await SandboxManager.isDockerAvailable();
  const sandboxBypasses = dockerConfirmed && Config.SANDBOX_AUTONOMOUS_MODE && toolCall?.name === "execute_system_command";
  let needsApproval = !sandboxBypasses && Config.REQUIRE_APPROVAL_FOR_DESTRUCTIVE && severity !== null;
  let approvalSeverity = severity;
  
  // Anti-Looping Heuristic (Death Spiral Prevention)
  if (state.actionHistory && state.actionHistory.length >= 2 && !isReplanRequested) {
    const recent = state.actionHistory.slice(-3);
    const allSameTool = recent.every((a: any) => a.tool === toolCall.name);
    const allSameArgs = recent.every((a: any) => JSON.stringify(a.args) === JSON.stringify(toolCall.args));
    
    // Strict identical-call loop (3+ times)
    if (allSameTool && allSameArgs && recent.length >= 3) {
      console.warn(`⚠️ [SelectionActor] DEATH SPIRAL DETECTED: Agent called ${toolCall.name} 3+ times with identical args. Forcing replan.`);
      toolCall.name = "system__request_replanning";
      toolCall.args = { thesis: `I am stuck in an infinite loop calling ${toolCall.name} repeatedly without making progress. I must stop, back up, and completely rethink my strategy using a different tool.` };
    }
    
    // Redundant success detection: If the agent already got the data 2x, stop.
    // EXEMPTION: system__read_skill and system__list_skills are SETUP steps, not
    // result-producing steps. Reading a skill twice without acting means the agent
    // has the instructions but is not applying them. Forcing task-complete here is
    // wrong -- force a replan instead so the agent acts on what it already read.
    const SETUP_TOOLS = new Set(["system__read_skill", "system__list_skills"]);
    const last2 = state.actionHistory.slice(-2);
    if (last2.length >= 2 && last2.every((a: any) => a.tool === toolCall.name && JSON.stringify(a.args) === JSON.stringify(toolCall.args))) {
      const allSucceeded = last2.every((a: any) => {
        try { return JSON.parse(a.result)?.status === "success"; } catch { return false; }
      });
      if (allSucceeded) {
        if (SETUP_TOOLS.has(toolCall.name)) {
          // Agent read the skill/list twice but has not applied the instructions.
          // Force a replan that demands execution, not more reading.
          console.warn(`⚠️ [SelectionActor] SKILL-READ LOOP: Agent called ${toolCall.name} twice with same args but has not applied the skill. Forcing execution replan.`);
          toolCall.name = "system__request_replanning";
          toolCall.args = {
            thesis: `I have already read the skill/list using ${toolCall.name} twice. ` +
              `Reading it again is not progress. I now MUST apply the skill instructions using ` +
              `my available action tools (execute_system_command, file__write, etc.). ` +
              `I will not call ${toolCall.name} again -- I will act on what I already read.`
          };
        } else {
          console.warn(`⚠️ [SelectionActor] REDUNDANT CALL DETECTED: ${toolCall.name} already succeeded 2x with same args. The data you need is already in your history. Synthesize a final answer.`);
          return A2AProtocol.commit("SelectionActor", {
            isTaskComplete: true,
            finalOutcome: `I have already successfully retrieved the required data using ${toolCall.name}. Reviewing my action history to synthesize the answer now.`,
            pendingAction: null,
            needsApproval: false,
            currentScreenshot,
            ...prunedState
          });
        }
      }
    }
  }

  // 3. Re-planning Budget & Intervention
  if (isReplanRequested) {
    if (replanCount >= 3) {
      console.warn("⚠️ [SelectionActor] Re-planning budget exhausted (3/3). Forcing human intervention.");
      // Hijack the tool call to force a system approval
      toolCall.name = "system__seek_approval";
      toolCall.args = { message: "I've tried re-planning 3 times and I'm still stuck. I need human eyes to identify the blocker." };
      needsApproval = true;
      approvalSeverity = 'destructive';
    }
  }
  
  // 3. Dynamic Plan Monitoring (Phase 4)
  const updatedPlanStatus = { ...state.planStatus };
  const currentPlan = state.strategicPlan || [];
  
  // Find the first step that isn't completed or failed
  const nextStep = currentPlan.find((step: string) => updatedPlanStatus[step] === 'pending' || updatedPlanStatus[step] === 'active');
  
  if (nextStep) {
    // If we have a new step, mark any previous 'active' steps as 'completed'
    Object.keys(updatedPlanStatus).forEach(step => {
      if (updatedPlanStatus[step] === 'active' && step !== nextStep) {
        updatedPlanStatus[step] = 'completed';
      }
    });
    updatedPlanStatus[nextStep] = 'active';
  }

  const reasoning = extractText(response.content);
  
  return A2AProtocol.commit("SelectionActor", {
    pendingAction: { tool: toolCall.name, args: toolCall.args },
    reasoning: reasoning,
    needsApproval,
    approvalSeverity,
    approvalStatus: needsApproval ? 'pending' : 'approved',
    currentScreenshot,
    planStatus: updatedPlanStatus,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0,
    ...prunedState
  });
}

/**
 * NODE 7b: ExecutionActor
 * Executes the previously selected tool.
 */
export async function executionActor(state: typeof MidpointXState.State) {
  const action = state.pendingAction;
  if (!action) return { isTaskComplete: true };

  // Check for Human Doorbell Rejection
  if (state.approvalStatus === 'denied') {
    return A2AProtocol.commit("ExecutionActor", {
      actionHistory: [...state.actionHistory, { tool: action.tool, args: action.args, result: "REJECTED BY USER" }],
      pendingAction: null,
      needsApproval: false,
      approvalStatus: null
    });
  }

  console.log(`🛠️ [ExecutionActor] Running: ${action.tool}`);
  let finalMessage = "";

  if (action.tool === "system__request_replanning") {
    const thesis = action.args.thesis || "No thesis provided.";
    console.log(`🔄 [ExecutionActor] Re-planning triggered. Thesis: ${thesis}`);
    
    return A2AProtocol.commit("ExecutionActor", {
      replanCount: 1, // Will be added via reducer
      failureThesis: thesis,
      abandonedPlans: [{ plan: state.strategicPlan, thesis: thesis }],
      pendingAction: null,
      actionHistory: [...state.actionHistory, { tool: action.tool, args: action.args, result: "RE-PLANNING IN PROGRESS" }]
    });
  }

  if (action.tool === "execute_system_command") {
    const cmd = String(action.args.command);
    const cwd = action.args.workingDirectory ? String(action.args.workingDirectory) : process.cwd();

    // Sandbox execution path (default: enabled)
    if (Config.USE_DOCKER_SANDBOX) {
      const dockerAvailable = await SandboxManager.isDockerAvailable();
      if (!dockerAvailable) {
        console.warn("[Sandbox] Docker not found — falling back to host shell. Set USE_DOCKER_SANDBOX=false to suppress.");
      } else {
        console.log("[Sandbox] Executing inside hardened Docker container...");
        const result = await SandboxManager.runInSandbox(cmd, cwd);
        if (result.timedOut) {
          finalMessage = JSON.stringify({ status: "error", errors: "Sandbox execution timed out." });
        } else {
          finalMessage = JSON.stringify({ status: "success", output: result.stdout, errors: result.stderr });
        }
      }
    }

    // Host shell path: runs when sandbox is disabled OR Docker is unavailable
    if (!finalMessage || finalMessage === "") {
      try {
        const isWindows = os.platform() === "win32";
        const detectedShell = state.environmentFingerprint?.capabilities?.shell || (isWindows ? "powershell.exe" : "/bin/bash");

        // Windows-Native Restricted Shell
        let hostCmd = cmd;
        if (isWindows) {
          const isMessaging = Config.TOOL_PROFILE === "messaging";
          const executionPolicy = isMessaging ? "Restricted" : "Bypass";
          console.log(`[Security] Hardening PowerShell (Policy: ${executionPolicy})...`);
          const wrappedCmd = `$ProgressPreference = 'SilentlyContinue'; ${cmd}`;
          const encoded = Buffer.from(wrappedCmd, "utf16le").toString("base64");
          hostCmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy ${executionPolicy} -EncodedCommand ${encoded}`;
        }

        const { stdout, stderr } = await execAsync(hostCmd, { cwd, shell: detectedShell });
        finalMessage = JSON.stringify({ status: "success", output: stdout.trim(), errors: stderr.trim() });
      } catch (err: any) {
        finalMessage = JSON.stringify({ status: "error", errors: err.message });
      }
    }
  } else {
    try {
      const out = await PluginRegistry.routeAndExecute(action.tool, action.args, state.operatorIdentity?.uid, state.executionMode);
      
      // Handle MCP specific error reporting
      if (out && typeof out === 'object' && out.isError) {
        // MCP errors return content as [{ type: "text", text: "..." }] -- extract properly
        // so the FAULT log is human-readable rather than "[object Object]".
        const errorText = Array.isArray(out.content)
          ? out.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
          : String(out.content);

        // ── ERROR-CLASS HANDLERS ──────────────────────────────────────────────
        // Each class injects a concrete fix into failureThesis so the Supervisor
        // can replan with actionable guidance rather than generic "try again".

        let fixHint = "Identify the root cause and retry with corrected arguments.";

        // Class A: Invalid URL scheme -- tool expected https:// but received a
        // notebook ID, file path, or bare string. Reconstruct the URL from args.
        if (errorText.toLowerCase().includes("url scheme") ||
            errorText.toLowerCase().includes("invalid url") ||
            errorText.toLowerCase().includes("url is not valid")) {
          const badUrl = Object.values(action.args as Record<string, unknown>)
            .find((v): v is string => typeof v === "string" && (v.includes("://") || v.startsWith("/"))) as string | undefined;
          fixHint =
            `INVALID_URL_SCHEME: The tool "${action.tool}" received a malformed URL. ` +
            `Bad value: "${badUrl ?? JSON.stringify(action.args)}". ` +
            `Fix: ensure the URL starts with "https://" and is a fully-qualified public URL, ` +
            `not a notebook ID, file path, or bare text string. ` +
            `If no public URL exists for this content, use a text-based source argument instead.`;
          console.warn(`⚠️ [ExecutionActor] INVALID_URL_SCHEME on ${action.tool} -- injecting fix hint.`);
        }

        // Class B: 403 / bot-blocked fetch -- permanent external block.
        if (action.tool === "fetch__fetch" && errorText.includes("403")) {
          fixHint =
            `FETCH_BLOCKED_403: ${action.args?.url} returned 403 (bot protection). ` +
            `Try searching for cached or alternative sources instead of fetching directly.`;
          console.warn(`⚠️ [ExecutionActor] 403 on ${action.args?.url}.`);
        }

        // Class C: Rate limit -- transient, retry after delay.
        if (errorText.toLowerCase().includes("rate limit") || errorText.toLowerCase().includes("429")) {
          fixHint =
            `RATE_LIMITED: Tool "${action.tool}" hit a rate limit. ` +
            `Wait at least 30 seconds before retrying. Do not call this tool again immediately.`;
          console.warn(`⚠️ [ExecutionActor] Rate limit hit on ${action.tool}.`);
        }

        const faultMsg = formatFault(action.tool, errorText, "Tool returned isError flag.", fixHint);
        finalMessage = JSON.stringify({ status: "error", errors: faultMsg, failureThesis: fixHint });
        console.error(`❌ [ExecutionActor] ${faultMsg}`);
      } else {
        // ═══════════════════════════════════════════════════════════════
        // MCP OUTPUT SANITIZATION: Extract clean text from CallToolResult
        // objects. MCP tools return { content: [{ type: "text", text: ... }] }
        // Storing raw nested JSON bloats the context window and causes
        // keyword collisions (e.g. the word "Error" in a status report).
        // ═══════════════════════════════════════════════════════════════
        let cleanOutput = out;
        if (out && typeof out === 'object') {
          // MCP CallToolResult format: { content: [{ type: "text", text: "..." }] }
          if (Array.isArray(out.content)) {
            cleanOutput = out.content
              .filter((block: any) => block.type === "text")
              .map((block: any) => block.text)
              .join("\n");
          } else if (out.content && typeof out.content === 'string') {
            cleanOutput = out.content;
          }
        }
        finalMessage = JSON.stringify({ status: "success", output: cleanOutput });
        console.log(`✅ [ExecutionActor] Tool ${action.tool} success.`);
      }
    } catch (err: any) {
      const faultMsg = formatFault(action.tool, err.message, "Unhandled exception during MCP tool execution.");
      finalMessage = JSON.stringify({ status: "error", errors: faultMsg });
      console.error(`❌ [ExecutionActor] ${faultMsg}`);

      // TOOL-NOT-FOUND ESCAPE HATCH: If the registry cannot find the tool at all,
      // retrying is pointless. Force a replan immediately so the agent does not burn
      // its entire turn budget on a tool that will never exist.
      // Root cause: agent confused a Markdown skill with a callable MCP tool,
      // e.g. tried "strategic_planner__generate_plan" which is never registered.
      if (err.message && err.message.includes("not found in registry")) {
        const missingTool = action.tool;
        console.error(
          `🚫 [ExecutionActor] TOOL_NOT_FOUND_ABORT: "${missingTool}" is not a registered tool. ` +
          `Forcing immediate replan -- do NOT retry this tool name.`
        );
        const thesis =
          `TOOL_NOT_FOUND: "${missingTool}" does not exist in the tool registry and cannot be called. ` +
          `This is a Markdown skill (reasoning guide), not an MCP-registered function. ` +
          `I must NOT retry this tool name. Instead I will call system__list_skills to see valid names, ` +
          `then system__read_skill with the correct hyphenated name, then apply its instructions.`;
        return A2AProtocol.commit("ExecutionActor", {
          replanCount: 1,
          failureThesis: thesis,
          abandonedPlans: [{ plan: state.strategicPlan, thesis }],
          pendingAction: null,
          actionHistory: [
            ...state.actionHistory,
            { tool: action.tool, args: action.args, result: JSON.stringify({ status: "error", errors: `TOOL_NOT_FOUND: ${missingTool} is not registered.` }) }
          ]
        });
      }
    }
  }

  // 4. Temporal Verification (Verify-After-Action)
  let temporalInsight = "";
  const isUITool = action.tool.startsWith("desktop__") || action.tool.startsWith("browser__");
  
  if (state.executionMode !== "api" && isUITool && action.tool !== "desktop__take_snapshot" && action.tool !== "browser__screenshot") {
    console.log(`👁️ [ExecutionActor] Triggering Region-Locked Motion Probe for verification...`);
    // Region-Locking: If args contain x,y, use them as anchor
    const region = (action.args.x && action.args.y) ? { x: action.args.x - 50, y: action.args.y - 50, w: 100, h: 100 } : undefined;
    try {
      const frames = await ScreenCapture.captureBurst(1, 3, region);
      temporalInsight = await ScreenCapture.getVisualDiff(frames, region);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("⚠️ [ExecutionActor] Temporal verification failed (non-fatal):", msg);
      temporalInsight = "";
    }
  }

  const isSnapshotTool = action.tool === "desktop__take_snapshot" || action.tool === "browser__screenshot";
  // Apply universal hard cap to all non-snapshot results. Snapshot results are already
  // stored as a truncated reference string by the routeAndExecute handler.
  const resultToStore = isSnapshotTool ? finalMessage : truncateOutput(finalMessage);
  const newHistoryRecord = [{ tool: action.tool, args: action.args, result: resultToStore }];
  
  // Artifact Extraction Heuristic
  const artifacts: any[] = [];
  const pathRegex = /([a-zA-Z]:\\[^"<>|]+|(?<=\s|^)\/[^"<>|]+)/g;
  const matches = finalMessage.match(pathRegex);
  if (matches) {
    for (const match of matches) {
      const normalized = match.trim();
      if (normalized.includes("Temp") || normalized.match(/\.(zip|gz|png|jpg|pdf|csv|json|md)$/i)) {
        artifacts.push({ type: 'file', path: normalized });
      }
    }
  }

  // Bug 1 fix: increment from state rather than resetting to 1
  const nextTurns = (state.internalTurns || 0) + 1;

  // Bug 3 fix: mark the currently-active plan step completed on tool success
  let toolSucceeded = false;
  try {
    const parsed = JSON.parse(finalMessage);
    toolSucceeded = parsed.status === "success";
  } catch { /* non-JSON result treated as neutral */ }

  const updatedPlanStatus = { ...state.planStatus };
  const activePlanStep = (state.strategicPlan || []).find(
    (s: string) => updatedPlanStatus[s] === 'active'
  );
  if (activePlanStep && toolSucceeded) {
    updatedPlanStatus[activePlanStep] = 'completed';
  }

  // Flaw 2 fix: clear stale cognitive worker output after successful execution
  // so the Supervisor doesn't re-read a developer's old code plan as "current" context.
  // On failure, preserve it so the Supervisor can still see the plan that was being executed.
  const nextWorkerOutput = toolSucceeded ? "" : state.workerOutput;

  return A2AProtocol.commit("ExecutionActor", {
    actionHistory: [...state.actionHistory, ...newHistoryRecord],
    pendingAction: null,
    needsApproval: false,
    approvalStatus: null,
    internalTurns: nextTurns,
    outputArtifacts: artifacts,
    temporalInsight: temporalInsight,
    planStatus: updatedPlanStatus,
    workerOutput: nextWorkerOutput,
  });
}
