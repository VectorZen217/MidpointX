import { Config } from "./config";

/**
 * SecretProvider: Lightweight credential resolver.
 * Two-layer lookup: process.env → Config object.
 * 5-minute TTL cache prevents redundant lookups in hot paths.
 * No external network calls — fully local and offline-capable.
 */
export class SecretProvider {
  private static CACHE = new Map<string, { value: string; expires: number }>();
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Retrieves a credential by key.
   * Resolution order: cache → process.env → Config object.
   */
  static async get(key: string, options?: { forceRefresh?: boolean }): Promise<string | undefined> {
    // 1. Check cache
    const cached = this.CACHE.get(key);
    if (cached && cached.expires > Date.now() && !options?.forceRefresh) {
      return cached.value;
    }

    // 2. process.env (primary — set via .env file or OS environment)
    const envVal = process.env[key];
    if (envVal) {
      this.CACHE.set(key, { value: envVal, expires: Date.now() + this.CACHE_TTL_MS });
      return envVal;
    }

    // 3. Validated Config object (fallback for fields with defaults)
    // @ts-ignore
    const configVal = Config[key];
    if (configVal && typeof configVal === "string") {
      this.CACHE.set(key, { value: configVal, expires: Date.now() + this.CACHE_TTL_MS });
      return configVal;
    }

    return undefined;
  }

  /**
   * Invalidate a specific cached key (e.g., after credential rotation).
   */
  static invalidate(key: string): void {
    this.CACHE.delete(key);
  }

  /**
   * Clear all cached credentials.
   */
  static clearAll(): void {
    this.CACHE.clear();
  }
}
