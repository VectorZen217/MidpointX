import fs from "fs/promises";
import path from "path";
import { CredentialVault } from "./credentialVault";

const CONFIG_PATH = path.resolve(process.cwd(), "src/workspace/connectors.json");
const HEALTH_INTERVAL_MS = 5 * 60 * 1000;

export type ConnectorCategory = "calendar" | "email" | "finance" | "tasks" | "communication" | "weather";
export type AuthType = "oauth2" | "apikey" | "basic" | "none";
export type HealthStatus = "healthy" | "degraded" | "failed" | "disconnected";

export interface ConnectorTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface ConnectorConfigField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
}

export interface IConnector {
  readonly id: string;
  readonly name: string;
  readonly category: ConnectorCategory;
  readonly authType: AuthType;
  readonly configFields: ConnectorConfigField[];
  connect(credentials: Record<string, string>): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getTools(): ConnectorTool[];
}

export class ConnectorRegistry {
  private static connectors: Map<string, IConnector> = new Map();
  private static activeConnectors: Map<string, IConnector> = new Map();
  private static healthStatus: Map<string, HealthStatus> = new Map();
  private static healthTimer: NodeJS.Timeout | null = null;

  static registerDefinition(connector: IConnector): void {
    this.connectors.set(connector.id, connector);
  }

  static getLibrary(): IConnector[] {
    return Array.from(this.connectors.values());
  }

  static async init(): Promise<void> {
    let config: Record<string, { enabled: boolean }> = {};
    try {
      const content = await fs.readFile(CONFIG_PATH, "utf8");
      config = JSON.parse(content);
    } catch { /* fresh start */ }

    for (const [id, state] of Object.entries(config)) {
      if (state.enabled) {
        try { await this.enable(id); } catch (e: any) {
          console.error(`[ConnectorRegistry] Failed to restore ${id}: ${e.message}`);
        }
      }
    }

    this.healthTimer = setInterval(() => this.runHealthChecks(), HEALTH_INTERVAL_MS);
    console.log("✅ [ConnectorRegistry] Initialized.");
  }

  static async enable(id: string, credentials?: Record<string, string>): Promise<void> {
    const connector = this.connectors.get(id);
    if (!connector) throw new Error(`Connector not found: ${id}`);

    const creds = credentials ?? await CredentialVault.retrieve(id) ?? {};

    await connector.connect(creds);
    this.activeConnectors.set(id, connector);
    this.healthStatus.set(id, "healthy");

    if (credentials && Object.keys(credentials).length > 0) {
      await CredentialVault.store(id, credentials);
    }

    // Dynamic import to avoid circular dependency with IntegrationToolBridge (Task 4)
    // @ts-expect-error integrationToolBridge does not exist until Task 4 is implemented
    const { IntegrationToolBridge } = await import("./integrationToolBridge");
    IntegrationToolBridge.register(id, connector.getTools());

    await this.saveConfig();
  }

  static async disable(id: string): Promise<void> {
    const connector = this.activeConnectors.get(id);
    if (!connector) return;
    try { await connector.disconnect(); } catch { /* best effort */ }
    this.activeConnectors.delete(id);
    this.healthStatus.delete(id);

    // Dynamic import to avoid circular dependency with IntegrationToolBridge (Task 4)
    // @ts-expect-error integrationToolBridge does not exist until Task 4 is implemented
    const { IntegrationToolBridge } = await import("./integrationToolBridge");
    IntegrationToolBridge.unregister(id);

    await this.saveConfig();
  }

  static async remove(id: string): Promise<void> {
    await this.disable(id);
    await CredentialVault.delete(id);
  }

  static getActive(): Array<{ id: string; name: string; category: ConnectorCategory; status: HealthStatus }> {
    return Array.from(this.activeConnectors.entries()).map(([id, c]) => ({
      id, name: c.name, category: c.category,
      status: this.healthStatus.get(id) ?? "disconnected"
    }));
  }

  static async forceHealthCheck(id: string): Promise<HealthStatus> {
    const connector = this.activeConnectors.get(id);
    if (!connector) return "disconnected";
    // Dynamic import to avoid circular dependency with IntegrationToolBridge (Task 4)
    // @ts-expect-error integrationToolBridge does not exist until Task 4 is implemented
    const { IntegrationToolBridge } = await import("./integrationToolBridge");
    try {
      const healthy = await connector.healthCheck();
      const status: HealthStatus = healthy ? "healthy" : "degraded";
      this.healthStatus.set(id, status);
      if (!healthy) IntegrationToolBridge.markDegraded(id);
      else IntegrationToolBridge.markHealthy(id);
      return status;
    } catch {
      this.healthStatus.set(id, "failed");
      IntegrationToolBridge.markDegraded(id);
      return "failed";
    }
  }

  private static async runHealthChecks(): Promise<void> {
    for (const id of this.activeConnectors.keys()) {
      await this.forceHealthCheck(id).catch(e =>
        console.error(`[ConnectorRegistry] Health check error for ${id}:`, e.message)
      );
    }
  }

  private static async saveConfig(): Promise<void> {
    const config: Record<string, { enabled: boolean }> = {};
    for (const id of this.activeConnectors.keys()) config[id] = { enabled: true };
    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  }

  static shutdown(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }
}
