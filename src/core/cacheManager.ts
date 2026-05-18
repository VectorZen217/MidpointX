import { Config } from "./config";
import { GoogleGenAI } from "@google/genai";
import { buildBaseIdentity } from "./prompt";
import { WorkspaceLoader } from "./workspaceLoader";
import { PluginRegistry } from "./pluginRegistry";

export interface LocalCacheState {
  cacheId: string;
  expiresAt: number; // Epoch timestamp
}

export class CacheManager {
  private static state: LocalCacheState | null = null;

  /**
   * Synchronously retrieves the active cache ID.
   * If the cache has expired or is nearing expiration (2-min buffer), it triggers
   * a non-blocking background re-initialization and returns null.
   */
  static getActiveCacheId(): string | null {
    if (!this.state) {
      return null;
    }

    if (Date.now() > this.state.expiresAt - 120000) {
      console.warn("🔄 [CacheManager] Active context cache is expiring or expired. Triggering background refresh...");
      this.state = null;
      
      // Non-blocking background reload
      this.init().catch(err => {
        console.error("❌ [CacheManager] Background cache reload failed:", err);
      });
      
      return null;
    }

    return this.state.cacheId;
  }

  /**
   * Evaluates context size, binds active tools/instructions, and registers
   * the explicit Google context cache to meet Google's Explicit Cache Rule.
   */
  static async init(): Promise<string | null> {
    console.log("⚙️ [CacheManager] Evaluating Gemini Context Cache feasibility...");

    try {
      const agentPersona = WorkspaceLoader.getAgentPersona();
      const userContext = WorkspaceLoader.getUserContext();
      
      // Build the exact, dynamic system context used across the engine
      const fullSystemPrompt = buildBaseIdentity(agentPersona, userContext);
      
      // Heuristic: Estimate token count (4 characters per token average)
      const estimatedTokens = Math.ceil(fullSystemPrompt.length / 4);
      
      // Context Caching requires >= 32,768 tokens to be active/supported on Gemini
      const MIN_CACHE_TOKENS = 32768;
      
      if (estimatedTokens < MIN_CACHE_TOKENS) {
        console.log(`ℹ️ [CacheManager] Context size (~${estimatedTokens} tokens) is below the 32k explicit cache threshold.`);
        console.log("   👉 Relying on Google's Implicit Context Caching (100% free, automatic, prefix-matched).");
        this.state = null;
        return null;
      }

      console.log(`⚙️ [CacheManager] Context size (~${estimatedTokens} tokens) meets threshold. Spinning up explicit cache...`);
      const ai = new GoogleGenAI({
        apiKey: Config.GEMINI_API_KEY
      });

      // Bundles structural tools directly inside the cache initialization payload
      const activeTools = PluginRegistry.getActiveTools().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: "object", properties: {} }
      }));

      const cacheResult = await ai.caches.create({
        model: "gemini-2.0-flash",
        config: {
          systemInstruction: fullSystemPrompt,
          tools: activeTools.length > 0 ? [{ functionDeclarations: activeTools as any }] : undefined,
          ttl: "3600s" // 1 hour TTL
        }
      });

      if (!cacheResult.name) {
        throw new Error("Cache creation succeeded but returned undefined name.");
      }

      console.log(`✅ [CacheManager] Cache successfully initialized: ${cacheResult.name}`);
      
      // Set to local memory state with epoch expiration
      this.state = {
        cacheId: cacheResult.name,
        expiresAt: Date.now() + 3600 * 1000 // 1 hour expiration
      };

      return cacheResult.name;
    } catch (error: any) {
      console.warn(`⚠️ [CacheManager] Context cache skipped: ${error?.message || String(error)}`);
      this.state = null;
      return null;
    }
  }
}

/**
 * Backward-compatible entrypoint wrapper for startup scripts (server.ts / cli.ts)
 */
export async function initContextCache() {
  return CacheManager.init();
}
