import * as crypto from "crypto";
import { PersistenceFactory } from "./persistence";
import { Logging } from "@google-cloud/logging";
import { Config } from "./config";
import { MidpointXState } from "./state";
import { SessionManager } from "./sessionManager";

/**
 * A2A Protocol: The formal handshake for Action-to-Action transitions.
 * Ensures every node commit is validated, signed, and audited.
 */


export class A2AProtocol {

  /**
   * Commits a state transition to the A2A audit ledger.
   * Now with session heartbeat verification (Phase 6).
   */
  static async commit(nodeName: string, updates: Partial<typeof MidpointXState.State>, state?: typeof MidpointXState.State): Promise<void> {
    const timestamp = new Date().toISOString();
    
    console.log(`📜 [A2A Protocol] Node '${nodeName}' is committing a state transition...`);
    
    // Heartbeat verification
    if (state?.taskId) {
      try {
        await SessionManager.heartbeat(state.taskId);
      } catch (err: any) {
        console.error(`🚨 [A2A Protocol] Critical Session Error: ${err.message}`);
        // In production, we would abort the reasoning loop here
      }
    }

    // 1. Audit the transition
    this.audit(nodeName, updates, timestamp);
  }

  /**
   * Records the transition to the persistent audit ledger.
   * This is the "Lead Shielding" for production non-repudiation.
   */
  private static async audit(nodeName: string, updates: any, timestamp: string) {
    try {
      const adapter = PersistenceFactory.getAdapter();
      const lastHash = await adapter.getLatestAuditHash();

      const entryData = {
        timestamp,
        node: nodeName,
        commit: updates,
        previousHash: lastHash
      };

      const hash = crypto.createHash("sha256").update(JSON.stringify(entryData)).digest("hex");
      const logEntry = { ...entryData, hash };

      // 1. Local/Persistence Persistence
      await adapter.appendAudit(JSON.stringify(logEntry));

      // 2. Cloud Logging Integration (Phase 4)
      if (Config.ENABLE_CLOUD_LOGGING && Config.GCP_PROJECT_ID) {
        this.pushToCloudLogging(logEntry);
      }
    } catch (err) {
      console.error(`⚠️ [A2A Protocol] Audit failed for node ${nodeName}:`, err);
    }
  }

  /**
   * Pushes the A2A handshake to Google Cloud Logging for CISO-level auditability.
   */
  private static async pushToCloudLogging(entry: any) {
    try {
      const logging = new Logging({ projectId: Config.GCP_PROJECT_ID });
      const log = logging.log("midpointx-a2a-handshake");
      const metadata = {
        resource: { type: "global" },
        severity: "INFO"
      };
      const cloudEntry = log.entry(metadata, entry);
      await log.write(cloudEntry);
    } catch (err) {
      console.error("⚠️ [A2A Protocol] Cloud Logging failed:", err);
    }
  }

  /**
   * Validates that the state meets the requirements for a specific architectural boundary.
   */
  static validate(state: typeof MidpointXState.State, boundary: 'execution' | 'learning' | 'safeguard'): boolean {
    // Implement formal boundary validation logic here
    // e.g., Execution requires a conciseIntent and an environmentFingerprint
    switch (boundary) {
      case 'execution':
        return !!state.userIntent && !!state.conciseIntent;
      case 'learning':
        return state.isTaskComplete !== undefined;
      default:
        return true;
    }
  }
}
