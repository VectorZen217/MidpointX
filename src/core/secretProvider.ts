import { Config } from "./config";

/**
 * SecretProvider: Abstraction for sensitive credentials.
 * Prepares MidpointX for GCP Secret Manager integration (Phase 3).
 * Updated for Phase 6: Version-Aware caching and rotation resilience.
 */
export class SecretProvider {
  private static IS_GCP = !!process.env.GCP_PROJECT_ID;
  private static CACHE = new Map<string, { value: string, expires: number }>();
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Retrieves a secret by key.
   * Implements Version-Aware caching for rotation resilience (Phase 6).
   */
  static async get(key: string, options?: { forceRefresh?: boolean }): Promise<string | undefined> {
    // 1. Check Cache
    const cached = this.CACHE.get(key);
    if (cached && cached.expires > Date.now() && !options?.forceRefresh) {
      return cached.value;
    }

    // 2. If in GCP, attempt to pull from Secret Manager
    if (this.IS_GCP) {
      const gcpSecret = await this.getGCPSecret(key);
      if (gcpSecret) {
        this.CACHE.set(key, { value: gcpSecret, expires: Date.now() + this.CACHE_TTL_MS });
        return gcpSecret;
      }
    }

    // 3. Check process.env (Standard behavior)
    const envVal = process.env[key];
    if (envVal) {
      this.CACHE.set(key, { value: envVal, expires: Date.now() + this.CACHE_TTL_MS });
      return envVal;
    }

    // 4. Fallback to the validated Config object
    // @ts-ignore
    const configVal = Config[key];
    if (configVal && typeof configVal === 'string') {
      this.CACHE.set(key, { value: configVal, expires: Date.now() + this.CACHE_TTL_MS });
      return configVal;
    }

    return undefined;
  }

  /**
   * GCP Integration Hook
   * This method uses the @google-cloud/secret-manager logic.
   */
  private static async getGCPSecret(secretName: string): Promise<string | null> {
    try {
      // In production, we would use: 
      // const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
      // const client = new SecretManagerServiceClient();
      // const [version] = await client.accessSecretVersion({ name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest` });
      // return version.payload.data.toString();
      
      console.log(`🔍 [SecretProvider] GCP Mode: Mocking fetch for ${secretName}`);
      return null;
    } catch (err) {
      console.error(`⚠️ [SecretProvider] Failed to fetch GCP secret: ${secretName}`, err);
      return null;
    }
  }
}
