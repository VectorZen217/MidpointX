import { MidpointXGraph } from "./graph";
import { Config } from "./config";
import { A2AService, SafetyCertificate } from "../services/a2aService";
import { MemoryManager } from "./memory";
import { MissionStore, MissionMode } from "./missionStore";

/**
 * Standard Payload for all incoming communication channels.
 */
export interface ChannelMessage {
  userId: string;
  intent: string;
  channel: "telegram" | "discord" | "web" | "api";
  a2aCertificate?: SafetyCertificate;
}

/**
 * Progress Metadata for UI updates.
 */
export interface ProgressUpdate {
  stage: string;
  data: any;
  tokenUsage: {
    input: number;
    output: number;
  };
}

/**
 * ChannelRouter
 * Decouples the messaging platforms from the MidpointX logic.
 */
export class ChannelRouter {
  /**
   * Routes a message to the MidpointX graph and returns the final reasoning outcome.
   * Supports streaming progress to an optional callback (e.g., for Web UI sync).
   */
  static async route(
    message: { 
      userId: string, 
      intent: string, 
      channel: string, 
      highFidelityContext?: string[],
      a2aCertificate?: SafetyCertificate,
      executionMode?: string
    }, 
    progressCallback?: (update: ProgressUpdate) => void
  ): Promise<any> {
    console.log(`📡 [ChannelRouter] Inbound from ${message.channel.toUpperCase()} (User: ${message.userId})`);
    
    // A2A Safety Handshake Enforcement
    if (message.channel === "api" || message.channel === "agent") {
      if (!message.a2aCertificate) {
        return "⚠️ A2A REJECTION: Missing Safety Certificate. Collaboration denied.";
      }
      const isValid = await A2AService.validateHandshake(message.a2aCertificate);
      if (!isValid) {
        return "⚠️ A2A REJECTION: Safety Handshake failed. Alignment proof is insufficient.";
      }
    }

    const threadId = message.userId;
    const isLongHorizon =
      message.executionMode === "long-horizon" ||
      message.intent.startsWith("[LONG-HORIZON]");
    const missionMode: MissionMode = isLongHorizon ? "long-horizon" : "short";
    MissionStore.register(threadId, message.intent, missionMode);

    const config = {
      configurable: { thread_id: message.userId },
      recursionLimit: Config.MAX_RECURSION_LIMIT
    };

    try {
      const stream = await MidpointXGraph.stream({
        taskId: `${message.channel.toUpperCase()}-${Date.now()}`,
        userIntent: message.intent,
        highFidelityContext: message.highFidelityContext || [],
        operatorIdentity: { 
          uid: message.userId, 
          source: message.channel,
          originatorId: message.a2aCertificate?.originatorId,
          timestamp: new Date().toISOString()
        },
        executionMode: message.executionMode || "api",
        threadId: threadId,
        // CRITICAL: Reset ephemeral state for new tasks on the same thread
        actionHistory: [],
        strategicPlan: [],
        planStatus: {},
        isTaskComplete: false,
        finalOutcome: "",
        internalTurns: 0,
        replanCount: 0,
        reflectionTrace: "",
        analysisResult: "",
        historySummary: "",    // Prevent prior mission's compaction summary from bleeding in
        failureThesis: "",     // Prevent prior mission's death spiral from pre-arming
        proposedShift: null    // Prevent last mission's theorem from auto-committing
      }, config);

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let accumulatedState: any = {};

      for await (const chunk of stream) {
        const nodeName = Object.keys(chunk)[0];
        const nodeOutput = (chunk as any)[nodeName];
        
        // Merge the node's output into the accumulated state
        accumulatedState = { ...accumulatedState, ...nodeOutput };

        if (nodeOutput?.totalInputTokens) totalInputTokens += nodeOutput.totalInputTokens;
        if (nodeOutput?.totalOutputTokens) totalOutputTokens += nodeOutput.totalOutputTokens;

        if (progressCallback && nodeName !== '__end__') {
          // 🛰️ UI Sync Optimization (Phase 4): 
          // Truncate massive data chunks (like base64 screenshots) to prevent socket/UI congestion
          const sanitizedOutput = { ...nodeOutput };
          if (sanitizedOutput.currentScreenshot && sanitizedOutput.currentScreenshot.length > 500) {
            sanitizedOutput.currentScreenshot = `[IMAGE_DATA_TRUNCATED: ${Math.round(sanitizedOutput.currentScreenshot.length / 1024)} KB]`;
          }

          progressCallback({
            stage: nodeName,
            data: sanitizedOutput,
            tokenUsage: { input: totalInputTokens, output: totalOutputTokens }
          });
        }
      }

      const finalState = accumulatedState;

      // Re-fetch full state if needed, but 'finalState' from the last node usually has what we need
      // Note: In LangGraph streaming, the last chunk is the last node's output.
      
      if (finalState.needsApproval && finalState.approvalStatus === "pending") {
        return {
          needsApproval: true,
          action: finalState.pendingAction,
          severity: finalState.approvalSeverity
        };
      }

      const outcomeRaw = finalState.finalOutcome || (finalState.isTaskComplete ? "Done." : "Cycle complete. No final outcome synthesized.");
      
      // 🛰️ Channel-Specific Post-Processing (Phase 4):
      // For mobile-first channels, we strip rationale and lead with data.
      let outcome = outcomeRaw;
      if (message.channel === "telegram" || message.channel === "discord") {
        const lines = outcomeRaw.split("\n");
        // If the response is long, keep only the first few lines or the key data point
        if (lines.length > 5) {
          outcome = lines.slice(0, 5).join("\n") + "\n... [TERSE MODE ACTIVE]";
        }
      }

      const artifacts = finalState.outputArtifacts || [];
      const turnsUsed = finalState.internalTurns || 0;
      const tokensUsed = { input: totalInputTokens, output: totalOutputTokens };

      // Auto-audit: Log every completed mission for post-mortem + RAG recall
      // [SECURITY]: Do not log sessions that were denied, aborted, or failed.
      const isFailureOrDenied = 
        finalState.approvalStatus === "denied" || 
        (finalState.failureThesis && finalState.failureThesis.length > 0) ||
        outcome.toLowerCase().includes("failed") || 
        outcome.toLowerCase().includes("abort") ||
        outcome.toLowerCase().includes("rejected");

      if (!isFailureOrDenied && (finalState.isTaskComplete || turnsUsed > 0)) {
        const toolsUsed = [...new Set((finalState.actionHistory || []).map((h: any) => h.tool))] as string[];
        MemoryManager.logSession(
          `${message.channel.toUpperCase()}-${Date.now()}`,
          message.intent,
          outcome,
          toolsUsed,
          { proactive: false }
        ).catch(() => {}); // Fire-and-forget, never block the response
      }

      MissionStore.complete(threadId);
      if (artifacts.length > 0) {
        return { message: outcome, artifacts, telemetry: { turns: turnsUsed, tokens: tokensUsed } };
      }
      return { message: outcome, telemetry: { turns: turnsUsed, tokens: tokensUsed } };

    } catch (error: any) {
      console.error(`❌ [ChannelRouter] Error during graph execution:`, error);
      MissionStore.fail(threadId, error.message || "Unknown Fault");
      return `⚠️ Internal Agent Error: ${error.message || "Unknown Fault"}`;
    }
  }

  /**
   * Resumes a paused graph after human approval.
   */
  static async resume(
    userId: string, 
    approved: boolean,
    onProgress?: (update: ProgressUpdate) => void
  ): Promise<any> {
    console.log(`📡 [ChannelRouter] Resuming task for User: ${userId} (Approved: ${approved})`);
    
    const config = { 
      configurable: { thread_id: userId },
      recursionLimit: Config.MAX_RECURSION_LIMIT 
    };

    try {
      // 1. Update the state in the checkpointer
      await MidpointXGraph.updateState(config, { 
        approvalStatus: approved ? 'approved' : 'denied',
        needsApproval: false 
      });

      // 2. Stream to resume
      const stream = await MidpointXGraph.stream(null, config);
      
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let accumulatedState: any = {};

      for await (const chunk of stream) {
        const nodeName = Object.keys(chunk)[0];
        const nodeOutput = (chunk as any)[nodeName];
        
        // Merge the node's output into the accumulated state
        accumulatedState = { ...accumulatedState, ...nodeOutput };

        if (nodeOutput?.totalInputTokens) totalInputTokens += nodeOutput.totalInputTokens;
        if (nodeOutput?.totalOutputTokens) totalOutputTokens += nodeOutput.totalOutputTokens;

        if (onProgress && nodeName !== '__end__') {
          // 🛰️ UI Sync Optimization (Phase 4): Truncate massive data
          const sanitizedOutput = { ...nodeOutput };
          if (sanitizedOutput.currentScreenshot && sanitizedOutput.currentScreenshot.length > 500) {
            sanitizedOutput.currentScreenshot = `[IMAGE_DATA_TRUNCATED: ${Math.round(sanitizedOutput.currentScreenshot.length / 1024)} KB]`;
          }

          onProgress({
            stage: nodeName,
            data: sanitizedOutput,
            tokenUsage: { input: totalInputTokens, output: totalOutputTokens }
          });
        }
      }

      const finalState = accumulatedState;

      // Handle nested approval interrupts during resumption
      if (finalState.needsApproval && finalState.approvalStatus === "pending") {
        return {
          needsApproval: true,
          action: finalState.pendingAction,
          severity: finalState.approvalSeverity
        };
      }

      const outcomeRaw = finalState.finalOutcome || (finalState.isTaskComplete ? "Done." : "Resumed. Cycle complete.");
      
      let outcome = outcomeRaw;
      // We don't have the original 'message' object here, but we can infer from thread_id or just skip for resume
      // For now, let's keep resume responses as-is or implement a global terseness if needed.

      const artifacts = finalState.outputArtifacts || [];
      const turnsUsed = finalState.internalTurns || 0;
      const tokensUsed = { input: totalInputTokens, output: totalOutputTokens };

      if (artifacts.length > 0) {
        return { message: outcome, artifacts, telemetry: { turns: turnsUsed, tokens: tokensUsed } };
      }
      return { message: outcome, telemetry: { turns: turnsUsed, tokens: tokensUsed } };

    } catch (error: any) {
      console.error(`❌ [ChannelRouter] Error during resumption:`, error);
      return `⚠️ Resumption Error: ${error.message}`;
    }
  }
}
