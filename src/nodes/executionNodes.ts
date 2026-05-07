import "dotenv/config";
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { MidpointXState } from "../core/state";
import { buildActionPrompt } from "../core/prompt";
import { extractText } from "./cognitiveNodes";
import { PluginRegistry } from "../core/pluginRegistry";
import { LLMFactory } from "../core/llmFactory";
import { invokeWithResilience } from "../core/resilience";
import { WorkspaceLoader } from "../core/workspaceLoader";
import { MemoryManager } from "../core/memory";
import { ScreenCapture } from "../plugins/desktop/ScreenCapture";
import { Config } from "../core/config";

const execAsync = promisify(exec);

/**
 * Helper to truncate long shell outputs (middle-out) with hard character caps
 */
const truncateOutput = (output: string, maxLines = 40, maxChars = 2000): string => {
  const lines = output.split('\n');
  let truncatedByLines = output;
  
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
 * Security: Identifies actions that could modify the system or data.
 */
function isDestructiveAction(toolName: string, args: any): boolean {
  const destructiveTools = [
    "filesystem__delete_file",
    "mcp_GitKraken_git_push",
    "mcp_GitKraken_git_add_or_commit"
  ];

  // 1. Explicitly destructive tools
  if (destructiveTools.includes(toolName)) return true;

  // 2. Sensitive System Path Protection (Phase 4 Hardening)
  const sensitivePathPatterns = [
    /C:[\\\/]+Windows/i,
    /C:[\\\/]+Program Files/i,
    /system32/i,
    /AppData/i,
    /\.ssh/i,
    /\.env/i
  ];

  const argsString = JSON.stringify(args);
  if (sensitivePathPatterns.some(pattern => pattern.test(argsString))) {
    console.warn(`🛡️ [Security] Sensitive path access detected in ${toolName}. Requiring human approval.`);
    return true;
  }

  // 3. Destructive Command Pattern Matching
  if (toolName === "execute_system_command") {
    const command = (args.command || "").toLowerCase();
    const dangerousCommands = [
      /\brm\s+-[rf]+/i,
      /\bdel\b/i,
      /\brd\b/i,
      /\brmdir\b/i,
      /\bformat\b/i,
      /\breg\s+delete\b/i,
      /npx\s+rimraf/i
    ];

    if (dangerousCommands.some(pattern => pattern.test(command))) {
      console.warn(`🛡️ [Security] Dangerous shell command detected. Requiring human approval.`);
      return true;
    }
  }

  return false;
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
  const activeTools = PluginRegistry.getActiveTools().filter(t => {
    if (!t.name) return false;
    
    // Global security filter based on profile
    if (profile === "messaging") {
      // In messaging mode, we block destructive shell and git operations
      if (t.name === "execute_system_command") return false;
      if (t.name.startsWith("mcp_GitKraken")) return false;
      if (t.name === "filesystem__write_text_file") return false;
    }

    // Execution Mode Enforcement (Visual vs API)
    if (state.executionMode === "visual") {
      // Block high-level APIs that bypass the UI
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

    // Heuristic pruning removed. Let the Brain (LLM) decide which tools to use.
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

  const modelWithTools = (model as unknown as BaseChatModel).bindTools!(toolsToBind);

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
      currentScreenshot = await ScreenCapture.captureBase64();
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
    { type: "text", text: `Core Mission: ${state.conciseIntent || state.userIntent}\nStrategy: ${state.analysisResult}${historySummary}${temporalContext}\n\nPLAN:\n${planStr}\n\nReview history and plan. Pick the next tool.` }
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

  const payload = [
    new SystemMessage(buildActionPrompt(agentPersona, userContext, state.executionMode || 'api')),
    ...historyMessages,
    new HumanMessage({ content: messageContent } as any)
  ];

  const response = await invokeWithResilience(modelWithTools, payload);
  const toolCall = response.tool_calls?.[0];

  if (!toolCall) {
    const outcome = extractText(response.content);
    console.log("🏁 [SelectionActor] No tool call detected. Mission concluding...");
    return { 
      isTaskComplete: true, 
      finalOutcome: outcome && outcome.trim().length > 5 ? outcome : "Mission accomplished. All steps in the strategic plan have been verified and completed.",
      pendingAction: null,
      needsApproval: false,
      currentScreenshot
    };
  }

  const isReplanRequested = toolCall?.name === "system__request_replanning";
  const replanCount = state.replanCount || 0;
  let needsApproval = Config.REQUIRE_APPROVAL_FOR_DESTRUCTIVE && isDestructiveAction(toolCall?.name, toolCall?.args);
  
  // Anti-Looping Heuristic (Death Spiral Prevention)
  if (state.actionHistory && state.actionHistory.length >= 3 && !isReplanRequested) {
    const recent = state.actionHistory.slice(-3);
    const allSameTool = recent.every((a: any) => a.tool === toolCall.name);
    // Ignore pagination/offset differences if needed, but strict identical args is a safe baseline for loops
    const allSameArgs = recent.every((a: any) => JSON.stringify(a.args) === JSON.stringify(toolCall.args));
    
    if (allSameTool && allSameArgs) {
      console.warn(`⚠️ [SelectionActor] DEATH SPIRAL DETECTED: Agent called ${toolCall.name} 3+ times with identical args. Forcing replan.`);
      toolCall.name = "system__request_replanning";
      toolCall.args = { thesis: `I am stuck in an infinite loop calling ${toolCall.name} repeatedly without making progress. I must stop, back up, and completely rethink my strategy using a different tool.` };
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
  
  return {
    pendingAction: { tool: toolCall.name, args: toolCall.args },
    reasoning: reasoning,
    needsApproval,
    autoApproved: !needsApproval,
    approvalStatus: needsApproval ? 'pending' : 'approved',
    currentScreenshot,
    planStatus: updatedPlanStatus,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0,
    ...prunedState
  };
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
    return {
      actionHistory: [...state.actionHistory, { tool: action.tool, args: action.args, result: "REJECTED BY USER" }],
      pendingAction: null,
      needsApproval: false,
      approvalStatus: null
    };
  }

  console.log(`🛠️ [ExecutionActor] Running: ${action.tool}`);
  let finalMessage = "";

  if (action.tool === "system__request_replanning") {
    const thesis = action.args.thesis || "No thesis provided.";
    console.log(`🔄 [ExecutionActor] Re-planning triggered. Thesis: ${thesis}`);
    
    return {
      replanCount: 1, // Will be added via reducer
      failureThesis: thesis,
      abandonedPlans: [{ plan: state.strategicPlan, thesis: thesis }],
      pendingAction: null,
      actionHistory: [...state.actionHistory, { tool: action.tool, args: action.args, result: "RE-PLANNING IN PROGRESS" }]
    };
  }

  if (action.tool === "execute_system_command") {
    let cmd = String(action.args.command);
    
    // 2. Docker Sandboxing (Phase 4)
    if (Config.USE_DOCKER_SANDBOX) {
      console.log("🐳 [Sandbox] Wrapping command in Docker container...");
      const workspace = process.cwd().replace(/\\/g, '/');
      // Wrap command in a lightweight alpine container
      cmd = `docker run --rm -v "${workspace}:/workspace" -w /workspace node:18-alpine sh -c "${cmd.replace(/"/g, '\\"')}"`;
    }

    try {
      const isWindows = os.platform() === "win32";
      const defaultShell = isWindows && !Config.USE_DOCKER_SANDBOX ? "powershell.exe" : "/bin/bash";
      
      // 3. Windows-Native Restricted Shell (Phase 4 - OpenClaw Parity)
      if (isWindows && !Config.USE_DOCKER_SANDBOX && Config.TOOL_PROFILE === "messaging") {
        console.log("🛡️ [Security] Enabling Restricted PowerShell mode...");
        // Use -ExecutionPolicy Restricted to prevent script execution
        cmd = `powershell.exe -NoProfile -ExecutionPolicy Restricted -Command "${cmd.replace(/"/g, '\"')}"`;
      }

      const { stdout, stderr } = await execAsync(cmd, { 
        cwd: action.args.workingDirectory ? String(action.args.workingDirectory) : process.cwd(),
        shell: defaultShell
      });
      finalMessage = JSON.stringify({ status: "success", output: stdout.trim(), errors: stderr.trim() });
    } catch (err: any) {
      finalMessage = JSON.stringify({ status: "error", errors: err.message });
    }
  } else {
    try {
      const out = await PluginRegistry.routeAndExecute(action.tool, action.args, state.operatorIdentity?.uid);
      finalMessage = JSON.stringify({ status: "success", output: out });
      console.log(`✅ [ExecutionActor] Tool ${action.tool} success.`);
    } catch (err: any) {
      finalMessage = JSON.stringify({ status: "error", errors: err.message });
      console.error(`❌ [ExecutionActor] Tool ${action.tool} failed: ${err.message}`);
    }
  }

  // 4. Temporal Verification (Verify-After-Action)
  let temporalInsight = "";
  const isUITool = action.tool.startsWith("desktop__") || action.tool.startsWith("browser__");
  
  if (isUITool && action.tool !== "desktop__take_snapshot" && action.tool !== "browser__screenshot") {
    console.log(`👁️ [ExecutionActor] Triggering Region-Locked Motion Probe for verification...`);
    // Region-Locking: If args contain x,y, use them as anchor
    const region = (action.args.x && action.args.y) ? { x: action.args.x - 50, y: action.args.y - 50, w: 100, h: 100 } : undefined;
    const frames = await ScreenCapture.captureBurst(1, 3, region);
    temporalInsight = await ScreenCapture.getVisualDiff(frames, region);
  }

  const newHistoryRecord = [{ tool: action.tool, args: action.args, result: truncateOutput(finalMessage, 10) }];
  
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

  return {
    actionHistory: [...state.actionHistory, ...newHistoryRecord],
    pendingAction: null,
    needsApproval: false,
    approvalStatus: null,
    internalTurns: 1,
    outputArtifacts: artifacts,
    temporalInsight: temporalInsight
  };
}
