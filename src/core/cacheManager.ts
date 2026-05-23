/**
 * CacheManager: Provider-agnostic in-memory TTL cache.
 * Replaces the Gemini-specific explicit context cache that required @google/genai.
 * Works across all LLM providers (Anthropic, OpenAI, OpenRouter, local, NVIDIA).
 */

interface CacheEntry {
  value: string;
  expires: number;
}

export class CacheManager {
  private static cache = new Map<string, CacheEntry>();
  private static DEFAULT_TTL_MS = 3_600_000; // 1 hour

  /**
   * Store a value with an optional TTL (default: 1 hour).
   */
  static set(key: string, value: string, ttlMs = CacheManager.DEFAULT_TTL_MS): void {
    this.cache.set(key, { value, expires: Date.now() + ttlMs });
  }

  /**
   * Retrieve a cached value, or null if missing/expired.
   */
  static get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Backward-compatible stub — always returns null.
   * Previously returned a Gemini cache ID; no longer applicable.
   */
  static getActiveCacheId(): string | null {
    return null;
  }

  /**
   * Evict all cached entries.
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Return count of live (non-expired) entries — useful for diagnostics.
   */
  static size(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.cache.values()) {
      if (now <= entry.expires) count++;
    }
    return count;
  }
}

/**
 * Backward-compatible entrypoint for startup scripts (server.ts / cli.ts).
 * Previously triggered Gemini context cache registration; now a no-op.
 */
export async function initContextCache(): Promise<null> {
  console.log("ℹ️ [CacheManager] Provider-agnostic in-memory cache active. No external API calls required.");
  return null;
}
