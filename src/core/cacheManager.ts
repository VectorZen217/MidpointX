import { Config } from "./config";
import { GoogleGenAI } from "@google/genai";
import { MIDPOINTX_SYSTEM_PROMPT } from "./prompt";

export async function initContextCache() {
  console.log("⚙️ [CacheManager] Initializing Gemini Context Cache...");

  try {
    const ai = new GoogleGenAI({
      apiKey: Config.GEMINI_API_KEY
    });

    // Context caching requires >= 32k tokens of system content to be cost-effective.
    // gemini-2.0-flash supports context caching.
    const cacheResult = await ai.caches.create({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: MIDPOINTX_SYSTEM_PROMPT,
        ttl: "3600s" // Cache for 1 hour standard buffer
      }
    });

    console.log(`✅ [CacheManager] Cache successfully initialized: ${cacheResult.name}`);
    
    // Set to global env to be picked up by the cognitive nodes
    process.env.ACTIVE_CONTEXT_CACHE = cacheResult.name;
    
    return cacheResult;
  } catch (error: any) {
    console.warn(`⚠️ [CacheManager] Context cache skipped: ${error?.message || String(error)}`);
  }
}

