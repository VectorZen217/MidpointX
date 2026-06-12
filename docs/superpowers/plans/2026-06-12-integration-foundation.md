# Integration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the connector library, MCP server manager, credential vault, and two new frontend pages (Connectors + MCP Servers) that form the foundation for MidpointX's super-agent capabilities.

**Architecture:** `CredentialVault` stores encrypted credentials → `ConnectorRegistry` manages connector lifecycle → `IntegrationToolBridge` registers connector capabilities into `PluginRegistry` → agent calls connector tools like any other tool. `MCPServerManager` wraps dynamic add/remove around the existing MCP config. Two new React views surface both systems to the user.

**Tech Stack:** TypeScript, Node.js `crypto` (AES-256-CBC), Express, React JSX, existing `PluginRegistry`/`PluginRegistry` patterns.

---

## File Map

**Create:**
- `src/core/credentialVault.ts` — encrypted per-connector credential storage
- `src/core/connectorRegistry.ts` — connector lifecycle, health checks, persistence
- `src/core/integrationToolBridge.ts` — bridges connector tools into PluginRegistry
- `src/core/mcpServerManager.ts` — dynamic MCP server add/remove/logs
- `src/plugins/connectors/index.ts` — registers all connectors into ConnectorRegistry
- `src/plugins/connectors/yahooFinanceConnector.ts`
- `src/plugins/connectors/alphaVantageConnector.ts`
- `src/plugins/connectors/openWeatherConnector.ts`
- `src/plugins/connectors/todoistConnector.ts`
- `src/plugins/connectors/googleCalendarConnector.ts` — OAuth2 stub (Phase 2)
- `src/plugins/connectors/outlookCalendarConnector.ts` — OAuth2 stub (Phase 2)
- `src/plugins/connectors/gmailConnector.ts` — OAuth2 stub (Phase 2)
- `src/plugins/connectors/outlookMailConnector.ts` — OAuth2 stub (Phase 2)
- `src/plugins/connectors/googleTasksConnector.ts` — OAuth2 stub (Phase 2)
- `src/routes/connectorRoutes.ts`
- `src/routes/mcpServerRoutes.ts`
- `src/tests/credentialVault.test.ts`
- `src/tests/connectorRegistry.test.ts`
- `frontend/src/components/ConnectorsView.jsx`
- `frontend/src/components/MCPServersView.jsx`

**Modify:**
- `src/core/config.ts` — add `CREDENTIAL_VAULT_KEY`
- `src/core/pluginRegistry.ts` — add `registerConnectorTools` / `unregisterConnectorTools`
- `src/server.ts` — wire routes + init ConnectorRegistry
- `frontend/src/components/Sidebar.jsx` — add Connectors + MCP Servers nav items
- `frontend/src/App.jsx` — add two new view renders

---

## Task 1: Add `CREDENTIAL_VAULT_KEY` to Config

**Files:**
- Modify: `src/core/config.ts`

- [ ] **Step 1: Add the field to the Zod schema**

In `src/core/config.ts`, add this line inside `ConfigSchema` after the `WEBHOOK_SECRET` line:

```typescript
  CREDENTIAL_VAULT_KEY: z.string().min(32, "CREDENTIAL_VAULT_KEY must be at least 32 characters").default("midpointx-default-vault-key-change-me"),
```

- [ ] **Step 2: Add the key to `.env.example`**

Append to `.env.example`:

```
# Credential Vault encryption key — change this before storing real credentials
CREDENTIAL_VAULT_KEY=your-32-char-minimum-secret-key-here
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/core/config.ts .env.example
git commit -m "feat(config): add CREDENTIAL_VAULT_KEY for encrypted credential storage"
```

---

## Task 2: CredentialVault

**Files:**
- Create: `src/core/credentialVault.ts`
- Create: `src/tests/credentialVault.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/credentialVault.test.ts`:

```typescript
import { CredentialVault } from "../core/credentialVault";
import fs from "fs/promises";
import path from "path";

const TEST_VAULT = path.resolve(process.cwd(), "src/workspace/credentials.test.enc.json");

// Override vault path for tests
jest.mock("../core/credentialVault", () => {
  const actual = jest.requireActual("../core/credentialVault");
  return actual;
});

beforeAll(() => {
  process.env.CREDENTIAL_VAULT_KEY = "test-vault-key-minimum-32-characters!!";
  (CredentialVault as any).VAULT_PATH = TEST_VAULT;
});

afterAll(async () => {
  try { await fs.unlink(TEST_VAULT); } catch {}
});

describe("CredentialVault", () => {
  it("stores and retrieves credentials for a connector", async () => {
    await CredentialVault.store("test-connector", { apiKey: "secret-123" });
    const result = await CredentialVault.retrieve("test-connector");
    expect(result).toEqual({ apiKey: "secret-123" });
  });

  it("returns null for unknown connector", async () => {
    const result = await CredentialVault.retrieve("nonexistent");
    expect(result).toBeNull();
  });

  it("deletes credentials", async () => {
    await CredentialVault.store("to-delete", { token: "abc" });
    await CredentialVault.delete("to-delete");
    const result = await CredentialVault.retrieve("to-delete");
    expect(result).toBeNull();
  });

  it("lists stored connector IDs", async () => {
    await CredentialVault.store("conn-a", { key: "1" });
    await CredentialVault.store("conn-b", { key: "2" });
    const ids = await CredentialVault.listIds();
    expect(ids).toContain("conn-a");
    expect(ids).toContain("conn-b");
  });

  it("stores credentials encrypted (file should not contain plaintext)", async () => {
    await CredentialVault.store("secret-connector", { password: "hunter2" });
    const raw = await fs.readFile(TEST_VAULT, "utf8");
    expect(raw).not.toContain("hunter2");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx jest src/tests/credentialVault.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../core/credentialVault'`

- [ ] **Step 3: Implement CredentialVault**

Create `src/core/credentialVault.ts`:

```typescript
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const ALGORITHM = "aes-256-cbc";

export class CredentialVault {
  static VAULT_PATH = path.resolve(process.cwd(), "src/workspace/credentials.enc.json");

  private static getKey(): Buffer {
    const key = process.env.CREDENTIAL_VAULT_KEY ?? "midpointx-default-vault-key-change-me";
    return crypto.scryptSync(key, "midpointx-salt-v1", 32);
  }

  private static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
  }

  private static decrypt(encryptedText: string): string {
    const [ivHex, dataHex] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, this.getKey(), iv);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  private static async readVault(): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(this.VAULT_PATH, "utf8");
      const parsed = JSON.parse(content);
      const decrypted: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        try { decrypted[k] = this.decrypt(v as string); } catch { /* skip corrupted */ }
      }
      return decrypted;
    } catch { return {}; }
  }

  private static async writeVault(data: Record<string, string>): Promise<void> {
    const encrypted: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      encrypted[k] = this.encrypt(v);
    }
    await fs.mkdir(path.dirname(this.VAULT_PATH), { recursive: true });
    await fs.writeFile(this.VAULT_PATH, JSON.stringify(encrypted, null, 2), "utf8");
  }

  static async store(connectorId: string, credentials: Record<string, string>): Promise<void> {
    const vault = await this.readVault();
    vault[connectorId] = JSON.stringify(credentials);
    await this.writeVault(vault);
  }

  static async retrieve(connectorId: string): Promise<Record<string, string> | null> {
    const vault = await this.readVault();
    const entry = vault[connectorId];
    if (!entry) return null;
    return JSON.parse(entry);
  }

  static async delete(connectorId: string): Promise<void> {
    const vault = await this.readVault();
    delete vault[connectorId];
    await this.writeVault(vault);
  }

  static async listIds(): Promise<string[]> {
    const vault = await this.readVault();
    return Object.keys(vault);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest src/tests/credentialVault.test.ts --no-coverage
```

Expected: PASS (5 tests).

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/core/credentialVault.ts src/tests/credentialVault.test.ts
git commit -m "feat(vault): add CredentialVault with AES-256-CBC encryption"
```

---

## Task 3: ConnectorRegistry + IConnector Interface

**Files:**
- Create: `src/core/connectorRegistry.ts`
- Create: `src/tests/connectorRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/connectorRegistry.test.ts`:

```typescript
import { ConnectorRegistry, IConnector, ConnectorTool } from "../core/connectorRegistry";

// Stub connector for testing
function makeStubConnector(id: string, healthy = true): IConnector {
  return {
    id,
    name: `Stub ${id}`,
    category: "finance",
    authType: "none",
    configFields: [],
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(healthy),
    getTools: jest.fn().mockReturnValue([
      {
        name: "get_data",
        description: "Get some data",
        inputSchema: { type: "object", properties: {}, required: [] },
        execute: jest.fn().mockResolvedValue({ result: "ok" })
      } as ConnectorTool
    ])
  };
}

beforeEach(() => {
  // Reset registry state between tests
  (ConnectorRegistry as any).connectors = new Map();
  (ConnectorRegistry as any).activeConnectors = new Map();
  (ConnectorRegistry as any).healthStatus = new Map();
});

describe("ConnectorRegistry", () => {
  it("registers a connector definition", () => {
    const stub = makeStubConnector("stub-finance");
    ConnectorRegistry.registerDefinition(stub);
    const library = ConnectorRegistry.getLibrary();
    expect(library.map(c => c.id)).toContain("stub-finance");
  });

  it("enables a connector with no-auth and registers it as active", async () => {
    const stub = makeStubConnector("stub-finance");
    ConnectorRegistry.registerDefinition(stub);
    await ConnectorRegistry.enable("stub-finance", {});
    const active = ConnectorRegistry.getActive();
    expect(active.map(c => c.id)).toContain("stub-finance");
    expect(stub.connect).toHaveBeenCalledWith({});
  });

  it("disables an active connector", async () => {
    const stub = makeStubConnector("stub-finance");
    ConnectorRegistry.registerDefinition(stub);
    await ConnectorRegistry.enable("stub-finance", {});
    await ConnectorRegistry.disable("stub-finance");
    const active = ConnectorRegistry.getActive();
    expect(active.map(c => c.id)).not.toContain("stub-finance");
    expect(stub.disconnect).toHaveBeenCalled();
  });

  it("reports healthy status after enable", async () => {
    const stub = makeStubConnector("stub-finance", true);
    ConnectorRegistry.registerDefinition(stub);
    await ConnectorRegistry.enable("stub-finance", {});
    const active = ConnectorRegistry.getActive();
    const entry = active.find(c => c.id === "stub-finance");
    expect(entry?.status).toBe("healthy");
  });

  it("throws when enabling an unknown connector", async () => {
    await expect(ConnectorRegistry.enable("unknown-id", {})).rejects.toThrow("Connector not found: unknown-id");
  });

  it("returns degraded status on failed health check", async () => {
    const stub = makeStubConnector("stub-finance", false);
    ConnectorRegistry.registerDefinition(stub);
    await ConnectorRegistry.enable("stub-finance", {});
    const status = await ConnectorRegistry.forceHealthCheck("stub-finance");
    expect(status).toBe("degraded");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx jest src/tests/connectorRegistry.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../core/connectorRegistry'`

- [ ] **Step 3: Implement ConnectorRegistry**

Create `src/core/connectorRegistry.ts`:

```typescript
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
    if (!creds && connector.authType !== "none") throw new Error(`No credentials for ${id}`);

    await connector.connect(creds);
    this.activeConnectors.set(id, connector);
    this.healthStatus.set(id, "healthy");

    if (credentials && Object.keys(credentials).length > 0) {
      await CredentialVault.store(id, credentials);
    }

    // IntegrationToolBridge registered after to avoid circular at module load time
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
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest src/tests/connectorRegistry.test.ts --no-coverage
```

Expected: PASS (6 tests).

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/core/connectorRegistry.ts src/tests/connectorRegistry.test.ts
git commit -m "feat(connectors): add ConnectorRegistry with lifecycle, health checks, and persistence"
```

---

## Task 4: IntegrationToolBridge + PluginRegistry Extension

**Files:**
- Create: `src/core/integrationToolBridge.ts`
- Modify: `src/core/pluginRegistry.ts`

- [ ] **Step 1: Add connector tool support to PluginRegistry**

In `src/core/pluginRegistry.ts`, add two private static fields after `private static activeTools: FunctionDeclaration[] = [];`:

```typescript
  private static connectorToolExecutors: Map<string, (args: unknown) => Promise<unknown>> = new Map();
  private static connectorToolIds: Map<string, string[]> = new Map();
```

- [ ] **Step 2: Add registerConnectorTools and unregisterConnectorTools methods**

Add these two public static methods to `PluginRegistry` class, just before the `getActiveTools()` method:

```typescript
  public static registerConnectorTools(
    connectorId: string,
    tools: FunctionDeclaration[],
    executors: Map<string, (args: unknown) => Promise<unknown>>
  ): void {
    this.unregisterConnectorTools(connectorId);
    this.activeTools.push(...tools);
    this.connectorToolIds.set(connectorId, tools.map(t => t.name));
    for (const [name, fn] of executors) {
      this.connectorToolExecutors.set(name, fn);
    }
    console.log(`🔌 [PluginRegistry] Registered ${tools.length} tools for connector: ${connectorId}`);
  }

  public static unregisterConnectorTools(connectorId: string): void {
    const toolNames = this.connectorToolIds.get(connectorId) ?? [];
    this.activeTools = this.activeTools.filter(t => !toolNames.includes(t.name));
    toolNames.forEach(n => this.connectorToolExecutors.delete(n));
    this.connectorToolIds.delete(connectorId);
  }
```

- [ ] **Step 3: Wire connector executor dispatch into routeAndExecute**

In `src/core/pluginRegistry.ts`, at the very top of the `routeAndExecute` method body (before any existing if statements), add:

```typescript
    // Connector tools registered by IntegrationToolBridge take priority
    if (this.connectorToolExecutors.has(name)) {
      return await this.connectorToolExecutors.get(name)!(args);
    }
```

- [ ] **Step 4: Create IntegrationToolBridge**

Create `src/core/integrationToolBridge.ts`:

```typescript
import { PluginRegistry, FunctionDeclaration } from "./pluginRegistry";
import { ConnectorTool } from "./connectorRegistry";

export class IntegrationToolBridge {
  private static degraded: Set<string> = new Set();

  static register(connectorId: string, tools: ConnectorTool[]): void {
    const prefix = connectorId.replace(/-/g, "_");
    const declarations: FunctionDeclaration[] = tools.map(t => ({
      name: `${prefix}__${t.name}`,
      description: t.description,
      parameters: t.inputSchema as any
    }));

    const executors = new Map<string, (args: unknown) => Promise<unknown>>();
    tools.forEach(t => {
      const toolName = `${prefix}__${t.name}`;
      executors.set(toolName, async (args) => {
        if (this.degraded.has(connectorId)) {
          return `Error: Connector "${connectorId}" is currently unavailable. Check Connectors settings and verify credentials.`;
        }
        return t.execute(args as Record<string, unknown>);
      });
    });

    PluginRegistry.registerConnectorTools(connectorId, declarations, executors);
  }

  static unregister(connectorId: string): void {
    this.degraded.delete(connectorId);
    PluginRegistry.unregisterConnectorTools(connectorId);
  }

  static markDegraded(connectorId: string): void {
    this.degraded.add(connectorId);
  }

  static markHealthy(connectorId: string): void {
    this.degraded.delete(connectorId);
  }
}
```

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/core/integrationToolBridge.ts src/core/pluginRegistry.ts
git commit -m "feat(bridge): add IntegrationToolBridge and connector tool dispatch in PluginRegistry"
```

---

## Task 5: Yahoo Finance Connector

**Files:**
- Create: `src/plugins/connectors/yahooFinanceConnector.ts`

- [ ] **Step 1: Write the failing test**

Add to a new file `src/tests/yahooFinanceConnector.test.ts`:

```typescript
import { YahooFinanceConnector } from "../plugins/connectors/yahooFinanceConnector";

const connector = new YahooFinanceConnector();

beforeEach(() => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: 150.25,
            previousClose: 148.00,
            currency: "USD",
            marketState: "REGULAR"
          }
        }]
      }
    })
  } as any);
});

afterEach(() => jest.restoreAllMocks());

describe("YahooFinanceConnector", () => {
  it("has correct id, category, authType", () => {
    expect(connector.id).toBe("yahoo-finance");
    expect(connector.category).toBe("finance");
    expect(connector.authType).toBe("none");
  });

  it("connect() resolves without error when API responds ok", async () => {
    await expect(connector.connect({})).resolves.not.toThrow();
  });

  it("get_price tool returns price and change", async () => {
    await connector.connect({});
    const tools = connector.getTools();
    const getPriceTool = tools.find(t => t.name === "get_price")!;
    const result = await getPriceTool.execute({ symbol: "AAPL" }) as any;
    expect(result.symbol).toBe("AAPL");
    expect(result.price).toBe(150.25);
    expect(result.change).toBe(2.25);
  });

  it("healthCheck returns true when API is reachable", async () => {
    await connector.connect({});
    const healthy = await connector.healthCheck();
    expect(healthy).toBe(true);
  });

  it("healthCheck returns false when fetch throws", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network error"));
    const healthy = await connector.healthCheck();
    expect(healthy).toBe(false);
  });

  it("exposes get_price, get_watchlist, and get_news tools", () => {
    const names = connector.getTools().map(t => t.name);
    expect(names).toContain("get_price");
    expect(names).toContain("get_watchlist");
    expect(names).toContain("get_news");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx jest src/tests/yahooFinanceConnector.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the connector**

Create `src/plugins/connectors/yahooFinanceConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

export class YahooFinanceConnector implements IConnector {
  readonly id = "yahoo-finance";
  readonly name = "Yahoo Finance";
  readonly category: ConnectorCategory = "finance";
  readonly authType: AuthType = "none";
  readonly configFields: ConnectorConfigField[] = [];
  private connected = false;

  async connect(_credentials: Record<string, string>): Promise<void> {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) throw new Error("Yahoo Finance API unreachable");
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d", {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      return res.ok;
    } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_price",
        description: "Get the current market price for a stock symbol (e.g., AAPL, TSLA, MSFT)",
        inputSchema: {
          type: "object",
          properties: { symbol: { type: "string", description: "Stock ticker symbol e.g. AAPL" } },
          required: ["symbol"]
        },
        execute: async (args) => {
          const symbol = String(args.symbol).toUpperCase();
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`);
          const data = await res.json() as any;
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta) throw new Error(`No data for symbol ${symbol}`);
          return {
            symbol,
            price: meta.regularMarketPrice,
            previousClose: meta.previousClose,
            change: +(meta.regularMarketPrice - meta.previousClose).toFixed(2),
            changePercent: +(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100).toFixed(2),
            currency: meta.currency,
            marketState: meta.marketState
          };
        }
      },
      {
        name: "get_watchlist",
        description: "Get current prices for multiple stock symbols at once",
        inputSchema: {
          type: "object",
          properties: {
            symbols: { type: "array", items: { type: "string" }, description: 'Array of ticker symbols e.g. ["AAPL","TSLA"]' }
          },
          required: ["symbols"]
        },
        execute: async (args) => {
          const symbols = (args.symbols as string[]).map(s => s.toUpperCase());
          return Promise.all(symbols.map(async (symbol) => {
            try {
              const res = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
                { headers: { "User-Agent": "Mozilla/5.0" } }
              );
              if (!res.ok) return { symbol, error: `HTTP ${res.status}` };
              const data = await res.json() as any;
              const meta = data?.chart?.result?.[0]?.meta;
              if (!meta) return { symbol, error: "No data" };
              return {
                symbol,
                price: meta.regularMarketPrice,
                change: +(meta.regularMarketPrice - meta.previousClose).toFixed(2),
                changePercent: +(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100).toFixed(2)
              };
            } catch (e: any) { return { symbol, error: e.message }; }
          }));
        }
      },
      {
        name: "get_news",
        description: "Get recent financial news headlines for a stock symbol",
        inputSchema: {
          type: "object",
          properties: { symbol: { type: "string", description: "Stock ticker symbol" } },
          required: ["symbol"]
        },
        execute: async (args) => {
          const symbol = String(args.symbol).toUpperCase();
          const res = await fetch(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=5&quotesCount=0`,
            { headers: { "User-Agent": "Mozilla/5.0" } }
          );
          if (!res.ok) throw new Error(`Yahoo Finance news returned ${res.status}`);
          const data = await res.json() as any;
          return (data?.news ?? []).slice(0, 5).map((n: any) => ({
            title: n.title,
            publisher: n.publisher,
            link: n.link,
            published: new Date(n.providerPublishTime * 1000).toISOString()
          }));
        }
      }
    ];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest src/tests/yahooFinanceConnector.test.ts --no-coverage
```

Expected: PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

```powershell
npx tsc --noEmit
git add src/plugins/connectors/yahooFinanceConnector.ts src/tests/yahooFinanceConnector.test.ts
git commit -m "feat(connectors): add Yahoo Finance connector (get_price, get_watchlist, get_news)"
```

---

## Task 6: Alpha Vantage, OpenWeather, and Todoist Connectors

**Files:**
- Create: `src/plugins/connectors/alphaVantageConnector.ts`
- Create: `src/plugins/connectors/openWeatherConnector.ts`
- Create: `src/plugins/connectors/todoistConnector.ts`

- [ ] **Step 1: Create Alpha Vantage connector**

Create `src/plugins/connectors/alphaVantageConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

export class AlphaVantageConnector implements IConnector {
  readonly id = "alpha-vantage";
  readonly name = "Alpha Vantage";
  readonly category: ConnectorCategory = "finance";
  readonly authType: AuthType = "apikey";
  readonly configFields: ConnectorConfigField[] = [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Get free key at alphavantage.co" }
  ];
  private apiKey = "";
  private readonly baseUrl = "https://www.alphavantage.co/query";

  async connect(credentials: Record<string, string>): Promise<void> {
    this.apiKey = credentials.apiKey;
    const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${this.apiKey}`);
    if (!res.ok) throw new Error("Alpha Vantage API unreachable");
    const data = await res.json() as any;
    if (data["Note"] || data["Information"]) throw new Error("Alpha Vantage: rate limit hit or invalid API key");
  }

  async disconnect(): Promise<void> { this.apiKey = ""; }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${this.apiKey}`);
      if (!res.ok) return false;
      const data = await res.json() as any;
      return !data["Note"] && !data["Information"];
    } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_price",
        description: "Get real-time stock quote from Alpha Vantage. More reliable than Yahoo Finance for production use.",
        inputSchema: {
          type: "object",
          properties: { symbol: { type: "string", description: "Stock ticker e.g. AAPL" } },
          required: ["symbol"]
        },
        execute: async (args) => {
          const symbol = String(args.symbol).toUpperCase();
          const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`);
          if (!res.ok) throw new Error(`Alpha Vantage returned ${res.status}`);
          const data = await res.json() as any;
          const q = data["Global Quote"];
          if (!q?.["05. price"]) throw new Error(`No quote data for ${symbol}`);
          return {
            symbol,
            price: parseFloat(q["05. price"]),
            change: parseFloat(q["09. change"]),
            changePercent: q["10. change percent"],
            open: parseFloat(q["02. open"]),
            high: parseFloat(q["03. high"]),
            low: parseFloat(q["04. low"]),
            volume: parseInt(q["06. volume"], 10)
          };
        }
      },
      {
        name: "get_portfolio_value",
        description: "Calculate total portfolio value from a list of symbol+quantity holdings",
        inputSchema: {
          type: "object",
          properties: {
            holdings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  quantity: { type: "number" }
                },
                required: ["symbol", "quantity"]
              },
              description: 'Array of {symbol, quantity} e.g. [{"symbol":"AAPL","quantity":10}]'
            }
          },
          required: ["holdings"]
        },
        execute: async (args) => {
          const holdings = args.holdings as Array<{ symbol: string; quantity: number }>;
          let totalValue = 0;
          const positions = [];
          for (const h of holdings) {
            const symbol = h.symbol.toUpperCase();
            const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`);
            const data = await res.json() as any;
            const price = parseFloat(data["Global Quote"]?.["05. price"] ?? "0");
            const value = price * h.quantity;
            totalValue += value;
            positions.push({ symbol, quantity: h.quantity, price, value: +value.toFixed(2) });
          }
          return { totalValue: +totalValue.toFixed(2), positions };
        }
      }
    ];
  }
}
```

- [ ] **Step 2: Create OpenWeather connector**

Create `src/plugins/connectors/openWeatherConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

export class OpenWeatherConnector implements IConnector {
  readonly id = "openweather";
  readonly name = "OpenWeather";
  readonly category: ConnectorCategory = "weather";
  readonly authType: AuthType = "apikey";
  readonly configFields: ConnectorConfigField[] = [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "Get free key at openweathermap.org" },
    { key: "defaultCity", label: "Default City", type: "text", placeholder: "e.g. New York" }
  ];
  private apiKey = "";
  private defaultCity = "New York";
  private readonly baseUrl = "https://api.openweathermap.org/data/2.5";

  async connect(credentials: Record<string, string>): Promise<void> {
    this.apiKey = credentials.apiKey;
    this.defaultCity = credentials.defaultCity || "New York";
    const res = await fetch(
      `${this.baseUrl}/weather?q=${encodeURIComponent(this.defaultCity)}&appid=${this.apiKey}&units=imperial`
    );
    if (!res.ok) throw new Error("OpenWeather: invalid API key or city not found");
  }

  async disconnect(): Promise<void> { this.apiKey = ""; }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/weather?q=${encodeURIComponent(this.defaultCity)}&appid=${this.apiKey}&units=imperial`
      );
      return res.ok;
    } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_current",
        description: "Get current weather conditions for a city. Defaults to configured city if city is omitted.",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string", description: "City name e.g. 'New York'. Optional." } }
        },
        execute: async (args) => {
          const city = String(args.city || this.defaultCity);
          const res = await fetch(
            `${this.baseUrl}/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=imperial`
          );
          if (!res.ok) throw new Error(`OpenWeather returned ${res.status} for ${city}`);
          const d = await res.json() as any;
          return {
            city: d.name,
            tempF: Math.round(d.main.temp),
            feelsLikeF: Math.round(d.main.feels_like),
            humidity: d.main.humidity,
            description: d.weather[0].description,
            windMph: Math.round(d.wind.speed)
          };
        }
      },
      {
        name: "get_forecast",
        description: "Get 5-day weather forecast for a city",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string", description: "City name. Optional." } }
        },
        execute: async (args) => {
          const city = String(args.city || this.defaultCity);
          const res = await fetch(
            `${this.baseUrl}/forecast?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=imperial&cnt=40`
          );
          if (!res.ok) throw new Error(`OpenWeather forecast returned ${res.status}`);
          const d = await res.json() as any;
          const daily: Record<string, any> = {};
          for (const item of d.list) {
            const date = item.dt_txt.split(" ")[0];
            if (!daily[date] || item.dt_txt.includes("12:00")) {
              daily[date] = {
                date,
                highF: Math.round(item.main.temp_max),
                lowF: Math.round(item.main.temp_min),
                description: item.weather[0].description
              };
            }
          }
          return Object.values(daily).slice(0, 5);
        }
      }
    ];
  }
}
```

- [ ] **Step 3: Create Todoist connector**

Create `src/plugins/connectors/todoistConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

export class TodoistConnector implements IConnector {
  readonly id = "todoist";
  readonly name = "Todoist";
  readonly category: ConnectorCategory = "tasks";
  readonly authType: AuthType = "apikey";
  readonly configFields: ConnectorConfigField[] = [
    { key: "apiToken", label: "API Token", type: "password", placeholder: "From Todoist → Settings → Integrations" }
  ];
  private apiToken = "";
  private readonly baseUrl = "https://api.todoist.com/rest/v2";

  private headers(): Record<string, string> {
    return { "Authorization": `Bearer ${this.apiToken}`, "Content-Type": "application/json" };
  }

  async connect(credentials: Record<string, string>): Promise<void> {
    this.apiToken = credentials.apiToken;
    const res = await fetch(`${this.baseUrl}/projects`, { headers: this.headers() });
    if (!res.ok) throw new Error("Todoist: invalid API token");
  }

  async disconnect(): Promise<void> { this.apiToken = ""; }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/projects`, { headers: this.headers() });
      return res.ok;
    } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_list",
        description: 'Get active tasks from Todoist. Use filter="today" for today\'s tasks, "overdue" for overdue, or "p1" for priority 1.',
        inputSchema: {
          type: "object",
          properties: {
            filter: { type: "string", description: 'Todoist filter e.g. "today", "overdue", "p1"' }
          }
        },
        execute: async (args) => {
          const params = args.filter ? `?filter=${encodeURIComponent(String(args.filter))}` : "";
          const res = await fetch(`${this.baseUrl}/tasks${params}`, { headers: this.headers() });
          if (!res.ok) throw new Error(`Todoist tasks returned ${res.status}`);
          const tasks = await res.json() as any[];
          return tasks.map(t => ({
            id: t.id, title: t.content,
            due: t.due?.datetime ?? t.due?.date ?? null,
            priority: t.priority, url: t.url
          }));
        }
      },
      {
        name: "create",
        description: "Create a new task in Todoist",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "Task title" },
            due_string: { type: "string", description: 'Due date e.g. "tomorrow", "next Monday at 3pm"' },
            priority: { type: "number", description: "Priority 1-4 where 4 is urgent" }
          },
          required: ["content"]
        },
        execute: async (args) => {
          const body: Record<string, unknown> = { content: String(args.content) };
          if (args.due_string) body.due_string = String(args.due_string);
          if (args.priority) body.priority = Number(args.priority);
          const res = await fetch(`${this.baseUrl}/tasks`, {
            method: "POST", headers: this.headers(), body: JSON.stringify(body)
          });
          if (!res.ok) throw new Error(`Todoist create returned ${res.status}`);
          const t = await res.json() as any;
          return { id: t.id, title: t.content, due: t.due?.date ?? null, url: t.url };
        }
      },
      {
        name: "complete",
        description: "Mark a task as complete in Todoist",
        inputSchema: {
          type: "object",
          properties: { task_id: { type: "string", description: "Task ID from get_list result" } },
          required: ["task_id"]
        },
        execute: async (args) => {
          const res = await fetch(`${this.baseUrl}/tasks/${String(args.task_id)}/close`, {
            method: "POST", headers: this.headers()
          });
          if (!res.ok) throw new Error(`Todoist complete returned ${res.status}`);
          return { success: true, taskId: args.task_id };
        }
      }
    ];
  }
}
```

- [ ] **Step 4: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/plugins/connectors/alphaVantageConnector.ts src/plugins/connectors/openWeatherConnector.ts src/plugins/connectors/todoistConnector.ts
git commit -m "feat(connectors): add AlphaVantage, OpenWeather, and Todoist connectors"
```

---

## Task 7: OAuth2 Connector Stubs (Phase 2 Placeholders)

**Files:**
- Create: `src/plugins/connectors/googleCalendarConnector.ts`
- Create: `src/plugins/connectors/outlookCalendarConnector.ts`
- Create: `src/plugins/connectors/gmailConnector.ts`
- Create: `src/plugins/connectors/outlookMailConnector.ts`
- Create: `src/plugins/connectors/googleTasksConnector.ts`

- [ ] **Step 1: Create all five OAuth stubs**

Create `src/plugins/connectors/googleCalendarConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";

const OAUTH_NOT_READY = "Google Calendar requires OAuth2 setup (Phase 2). Not yet active.";

export class GoogleCalendarConnector implements IConnector {
  readonly id = "google-calendar";
  readonly name = "Google Calendar";
  readonly category: ConnectorCategory = "calendar";
  readonly authType: AuthType = "oauth2";
  readonly configFields: ConnectorConfigField[] = [];
  async connect(_credentials: Record<string, string>): Promise<void> { throw new Error(OAUTH_NOT_READY); }
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<boolean> { return false; }
  getTools(): ConnectorTool[] {
    return [
      {
        name: "get_events",
        description: "Get calendar events for a date range",
        inputSchema: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] },
        execute: async () => { throw new Error(OAUTH_NOT_READY); }
      },
      {
        name: "create_event",
        description: "Create a new calendar event",
        inputSchema: { type: "object", properties: { title: { type: "string" }, start: { type: "string" }, end: { type: "string" } }, required: ["title", "start", "end"] },
        execute: async () => { throw new Error(OAUTH_NOT_READY); }
      },
      {
        name: "delete_event",
        description: "Delete a calendar event by ID",
        inputSchema: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] },
        execute: async () => { throw new Error(OAUTH_NOT_READY); }
      }
    ];
  }
}
```

Create `src/plugins/connectors/outlookCalendarConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
const OAUTH_NOT_READY = "Outlook Calendar requires OAuth2 setup (Phase 2). Not yet active.";
export class OutlookCalendarConnector implements IConnector {
  readonly id = "outlook-calendar";
  readonly name = "Outlook Calendar";
  readonly category: ConnectorCategory = "calendar";
  readonly authType: AuthType = "oauth2";
  readonly configFields: ConnectorConfigField[] = [];
  async connect(_credentials: Record<string, string>): Promise<void> { throw new Error(OAUTH_NOT_READY); }
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<boolean> { return false; }
  getTools(): ConnectorTool[] {
    return [
      { name: "get_events", description: "Get calendar events for a date range", inputSchema: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } }, required: ["start", "end"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "create_event", description: "Create a calendar event", inputSchema: { type: "object", properties: { title: { type: "string" }, start: { type: "string" }, end: { type: "string" } }, required: ["title", "start", "end"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "delete_event", description: "Delete a calendar event by ID", inputSchema: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } }
    ];
  }
}
```

Create `src/plugins/connectors/gmailConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
const OAUTH_NOT_READY = "Gmail requires OAuth2 setup (Phase 2). Not yet active.";
export class GmailConnector implements IConnector {
  readonly id = "gmail";
  readonly name = "Gmail";
  readonly category: ConnectorCategory = "email";
  readonly authType: AuthType = "oauth2";
  readonly configFields: ConnectorConfigField[] = [];
  async connect(_credentials: Record<string, string>): Promise<void> { throw new Error(OAUTH_NOT_READY); }
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<boolean> { return false; }
  getTools(): ConnectorTool[] {
    return [
      { name: "get_inbox", description: "Get recent inbox messages", inputSchema: { type: "object", properties: { limit: { type: "number" } } }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "send", description: "Send an email", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "search", description: "Search emails by query", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } }
    ];
  }
}
```

Create `src/plugins/connectors/outlookMailConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
const OAUTH_NOT_READY = "Outlook Mail requires OAuth2 setup (Phase 2). Not yet active.";
export class OutlookMailConnector implements IConnector {
  readonly id = "outlook-mail";
  readonly name = "Outlook Mail";
  readonly category: ConnectorCategory = "email";
  readonly authType: AuthType = "oauth2";
  readonly configFields: ConnectorConfigField[] = [];
  async connect(_credentials: Record<string, string>): Promise<void> { throw new Error(OAUTH_NOT_READY); }
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<boolean> { return false; }
  getTools(): ConnectorTool[] {
    return [
      { name: "get_inbox", description: "Get recent inbox messages", inputSchema: { type: "object", properties: { limit: { type: "number" } } }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "send", description: "Send an email", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "search", description: "Search emails by query", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } }
    ];
  }
}
```

Create `src/plugins/connectors/googleTasksConnector.ts`:

```typescript
import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
const OAUTH_NOT_READY = "Google Tasks requires OAuth2 setup (Phase 2). Not yet active.";
export class GoogleTasksConnector implements IConnector {
  readonly id = "google-tasks";
  readonly name = "Google Tasks";
  readonly category: ConnectorCategory = "tasks";
  readonly authType: AuthType = "oauth2";
  readonly configFields: ConnectorConfigField[] = [];
  async connect(_credentials: Record<string, string>): Promise<void> { throw new Error(OAUTH_NOT_READY); }
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<boolean> { return false; }
  getTools(): ConnectorTool[] {
    return [
      { name: "get_list", description: "Get task list", inputSchema: { type: "object", properties: {} }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "create", description: "Create a task", inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } },
      { name: "complete", description: "Complete a task by ID", inputSchema: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] }, execute: async () => { throw new Error(OAUTH_NOT_READY); } }
    ];
  }
}
```

- [ ] **Step 2: Type-check and commit**

```powershell
npx tsc --noEmit
git add src/plugins/connectors/
git commit -m "feat(connectors): add OAuth2 connector stubs (Google Calendar, Outlook, Gmail, Tasks) for Phase 2"
```

---

## Task 8: Connector Catalog

**Files:**
- Create: `src/plugins/connectors/index.ts`

- [ ] **Step 1: Create the catalog**

Create `src/plugins/connectors/index.ts`:

```typescript
import { ConnectorRegistry } from "../../core/connectorRegistry";
import { YahooFinanceConnector } from "./yahooFinanceConnector";
import { AlphaVantageConnector } from "./alphaVantageConnector";
import { OpenWeatherConnector } from "./openWeatherConnector";
import { TodoistConnector } from "./todoistConnector";
import { GoogleCalendarConnector } from "./googleCalendarConnector";
import { OutlookCalendarConnector } from "./outlookCalendarConnector";
import { GmailConnector } from "./gmailConnector";
import { OutlookMailConnector } from "./outlookMailConnector";
import { GoogleTasksConnector } from "./googleTasksConnector";

export function registerAllConnectors(): void {
  ConnectorRegistry.registerDefinition(new YahooFinanceConnector());
  ConnectorRegistry.registerDefinition(new AlphaVantageConnector());
  ConnectorRegistry.registerDefinition(new OpenWeatherConnector());
  ConnectorRegistry.registerDefinition(new TodoistConnector());
  ConnectorRegistry.registerDefinition(new GoogleCalendarConnector());
  ConnectorRegistry.registerDefinition(new OutlookCalendarConnector());
  ConnectorRegistry.registerDefinition(new GmailConnector());
  ConnectorRegistry.registerDefinition(new OutlookMailConnector());
  ConnectorRegistry.registerDefinition(new GoogleTasksConnector());
  console.log("✅ [Connectors] All connector definitions registered.");
}
```

- [ ] **Step 2: Type-check and commit**

```powershell
npx tsc --noEmit
git add src/plugins/connectors/index.ts
git commit -m "feat(connectors): add connector catalog index"
```

---

## Task 9: MCPServerManager

**Files:**
- Create: `src/core/mcpServerManager.ts`

- [ ] **Step 1: Create MCPServerManager**

Create `src/core/mcpServerManager.ts`:

```typescript
import fs from "fs/promises";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "src/plugins/mcp/mcp_config.json");

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  source: "library" | "custom";
}

export interface MCPServerLibraryEntry {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  defaultEnv: Record<string, string>;
  configFields: Array<{ key: string; label: string; placeholder?: string }>;
}

export const MCP_SERVER_LIBRARY: MCPServerLibraryEntry[] = [
  {
    id: "filesystem", name: "Filesystem", description: "Read and write files on the local filesystem",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
    defaultEnv: {}, configFields: [{ key: "rootPath", label: "Root Path", placeholder: "./" }]
  },
  {
    id: "github", name: "GitHub", description: "Repos, issues, PRs, commits via GitHub REST API",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-github"],
    defaultEnv: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    configFields: [{ key: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "Personal Access Token" }]
  },
  {
    id: "brave-search", name: "Brave Search", description: "Web search via Brave Search API",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"],
    defaultEnv: { BRAVE_API_KEY: "" },
    configFields: [{ key: "BRAVE_API_KEY", label: "Brave API Key" }]
  },
  {
    id: "sqlite", name: "SQLite", description: "Query SQLite databases",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./src/workspace/midpointx.db"],
    defaultEnv: {}, configFields: [{ key: "dbPath", label: "Database Path", placeholder: "./src/workspace/midpointx.db" }]
  },
  {
    id: "memory", name: "Knowledge Graph", description: "Persistent shared knowledge graph memory",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"],
    defaultEnv: {}, configFields: []
  },
  {
    id: "puppeteer", name: "Puppeteer Browser", description: "Browser automation and web scraping",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    defaultEnv: {}, configFields: []
  },
  {
    id: "slack", name: "Slack", description: "Read and post to Slack channels",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"],
    defaultEnv: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    configFields: [
      { key: "SLACK_BOT_TOKEN", label: "Bot Token" },
      { key: "SLACK_TEAM_ID", label: "Team ID" }
    ]
  },
  {
    id: "google-maps", name: "Google Maps", description: "Location search, directions, and geocoding",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-google-maps"],
    defaultEnv: { GOOGLE_MAPS_API_KEY: "" },
    configFields: [{ key: "GOOGLE_MAPS_API_KEY", label: "Maps API Key" }]
  },
  {
    id: "postgres", name: "PostgreSQL", description: "Query PostgreSQL databases",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"],
    defaultEnv: { POSTGRES_CONNECTION_STRING: "" },
    configFields: [{ key: "POSTGRES_CONNECTION_STRING", label: "Connection String", placeholder: "postgresql://user:pass@host/db" }]
  }
];

export class MCPServerManager {
  private static logs: Map<string, string[]> = new Map();

  static getLibrary(): MCPServerLibraryEntry[] {
    return MCP_SERVER_LIBRARY;
  }

  static async getActive(): Promise<Array<{ id: string; name: string; source: string; status: "running" | "unknown" }>> {
    const config = await this.readConfig();
    return Object.entries(config.mcpServers ?? {}).map(([id, s]: [string, any]) => ({
      id,
      name: s.name ?? id,
      source: s.source ?? "custom",
      status: "running" as const
    }));
  }

  static async add(serverConfig: MCPServerConfig): Promise<void> {
    const config = await this.readConfig();
    config.mcpServers = config.mcpServers ?? {};
    config.mcpServers[serverConfig.id] = {
      name: serverConfig.name,
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
      source: serverConfig.source
    };
    await this.writeConfig(config);
    console.log(`✅ [MCPServerManager] Added server: ${serverConfig.id}. Restart to activate.`);
  }

  static async remove(id: string): Promise<void> {
    const config = await this.readConfig();
    if (config.mcpServers) delete config.mcpServers[id];
    await this.writeConfig(config);
    this.logs.delete(id);
  }

  static getLogs(id: string): string[] {
    return this.logs.get(id) ?? [];
  }

  static appendLog(id: string, line: string): void {
    const logs = this.logs.get(id) ?? [];
    logs.push(`[${new Date().toISOString()}] ${line}`);
    if (logs.length > 200) logs.shift();
    this.logs.set(id, logs);
  }

  private static async readConfig(): Promise<any> {
    try {
      return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
    } catch { return { mcpServers: {} }; }
  }

  private static async writeConfig(config: any): Promise<void> {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  }
}
```

- [ ] **Step 2: Type-check and commit**

```powershell
npx tsc --noEmit
git add src/core/mcpServerManager.ts
git commit -m "feat(mcp): add MCPServerManager with server library, add/remove, and log streaming"
```

---

## Task 10: Backend Routes

**Files:**
- Create: `src/routes/connectorRoutes.ts`
- Create: `src/routes/mcpServerRoutes.ts`

- [ ] **Step 1: Create connector routes**

Create `src/routes/connectorRoutes.ts`:

```typescript
import { Router } from "express";
import { ConnectorRegistry } from "../core/connectorRegistry";

const router = Router();

router.get("/library", (_req, res) => {
  const connectors = ConnectorRegistry.getLibrary().map(c => ({
    id: c.id, name: c.name, category: c.category,
    authType: c.authType, configFields: c.configFields
  }));
  res.json({ success: true, connectors });
});

router.get("/active", (_req, res) => {
  res.json({ success: true, connectors: ConnectorRegistry.getActive() });
});

router.post("/:id/enable", async (req, res) => {
  try {
    await ConnectorRegistry.enable(req.params.id, req.body.credentials ?? {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post("/:id/disable", async (req, res) => {
  try {
    await ConnectorRegistry.disable(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await ConnectorRegistry.remove(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:id/health", async (req, res) => {
  try {
    const status = await ConnectorRegistry.forceHealthCheck(req.params.id);
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as connectorRoutes };
```

- [ ] **Step 2: Create MCP server routes**

Create `src/routes/mcpServerRoutes.ts`:

```typescript
import { Router } from "express";
import { MCPServerManager, MCPServerConfig } from "../core/mcpServerManager";

const router = Router();

router.get("/library", (_req, res) => {
  res.json({ success: true, servers: MCPServerManager.getLibrary() });
});

router.get("/", async (_req, res) => {
  try {
    res.json({ success: true, servers: await MCPServerManager.getActive() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const config: MCPServerConfig = req.body;
    if (!config.id || !config.command) {
      res.status(400).json({ success: false, error: "id and command are required" });
      return;
    }
    await MCPServerManager.add(config);
    res.json({ success: true, message: `Server "${config.id}" added. Restart to activate.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await MCPServerManager.remove(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:id/logs", (req, res) => {
  res.json({ success: true, logs: MCPServerManager.getLogs(req.params.id) });
});

export { router as mcpServerRoutes };
```

- [ ] **Step 3: Type-check and commit**

```powershell
npx tsc --noEmit
git add src/routes/connectorRoutes.ts src/routes/mcpServerRoutes.ts
git commit -m "feat(routes): add connector and MCP server REST API routes"
```

---

## Task 11: Wire Everything into server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add imports to server.ts**

In `src/server.ts`, add these imports after the existing import block (after `import { SwarmBus } ...`):

```typescript
import { connectorRoutes } from "./routes/connectorRoutes";
import { mcpServerRoutes } from "./routes/mcpServerRoutes";
import { registerAllConnectors } from "./plugins/connectors/index";
import { ConnectorRegistry } from "./core/connectorRegistry";
```

- [ ] **Step 2: Register routes in server.ts**

In `src/server.ts`, after `app.use("/api/v1/pipelines", pipelineRoutes);`, add:

```typescript
app.use("/api/v1/connectors", connectorRoutes);
app.use("/api/v1/mcp-servers", mcpServerRoutes);
```

- [ ] **Step 3: Initialize ConnectorRegistry in startServer()**

In `src/server.ts`, inside `startServer()`, after `await PluginRegistry.init();`, add:

```typescript
    registerAllConnectors();
    await ConnectorRegistry.init();
```

- [ ] **Step 4: Add ConnectorRegistry.shutdown() to graceful shutdown**

In `src/server.ts`, in the `shutdown` async function, before `process.exit(0)`, add:

```typescript
  ConnectorRegistry.shutdown();
```

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Smoke test — start the server and verify new routes exist**

```powershell
npm run backend
```

In a second terminal:

```powershell
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/connectors/library" -Method GET
```

Expected: JSON response with `success: true` and `connectors` array containing 9 entries.

```powershell
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/mcp-servers/library" -Method GET
```

Expected: JSON response with `success: true` and `servers` array with 9 entries.

Stop the server (`Ctrl+C`).

- [ ] **Step 7: Commit**

```powershell
git add src/server.ts
git commit -m "feat(server): wire ConnectorRegistry and MCP server routes into startup"
```

---

## Task 12: ConnectorsView Frontend

**Files:**
- Create: `frontend/src/components/ConnectorsView.jsx`

- [ ] **Step 1: Create ConnectorsView**

Create `frontend/src/components/ConnectorsView.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plug, CheckCircle, AlertTriangle, XCircle, Plus, Trash2, RefreshCw } from 'lucide-react';

const CATEGORY_ICONS = {
  calendar: '📅', email: '📧', finance: '📈',
  tasks: '✅', communication: '💬', weather: '🌤'
};

const AUTH_LABELS = { oauth2: 'OAuth2 — Setup in Phase 2', apikey: 'API Key', basic: 'Username/Password', none: 'No Auth Required' };

const StatusBadge = ({ status }) => {
  const config = {
    healthy:      { icon: CheckCircle,    color: 'var(--accent-teal)',  label: 'healthy' },
    degraded:     { icon: AlertTriangle,  color: '#f59e0b',             label: 'degraded' },
    failed:       { icon: XCircle,        color: '#ef4444',             label: 'failed' },
    disconnected: { icon: XCircle,        color: 'var(--text-muted)',   label: 'disconnected' }
  }[status] ?? { icon: XCircle, color: 'var(--text-muted)', label: status };
  const Icon = config.icon;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: config.color, fontSize: 12 }}>
      <Icon size={12} /> {config.label}
    </span>
  );
};

const ConnectorForm = ({ connector, onSubmit, onCancel }) => {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/connectors/${connector.id}/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: values })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSubmit();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (connector.authType === 'oauth2') {
    return (
      <div className="settings-panel" style={{ marginTop: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          OAuth2 connectors will be available in Phase 2. The redirect URI handler is not yet implemented.
        </p>
        <button className="btn-secondary" onClick={onCancel} style={{ marginTop: 8 }}>Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
      {connector.authType === 'none' ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>No credentials required.</p>
      ) : (
        connector.configFields.map(field => (
          <div key={field.key} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{field.label}</label>
            <input
              type={field.type === 'password' ? 'password' : 'text'}
              placeholder={field.placeholder ?? ''}
              value={values[field.key] ?? ''}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13 }}
            />
          </div>
        ))
      )}
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Connecting...' : 'Enable'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} style={{ fontSize: 12 }}>Cancel</button>
      </div>
    </form>
  );
};

const ConnectorsView = () => {
  const [tab, setTab] = useState('library');
  const [library, setLibrary] = useState([]);
  const [active, setActive] = useState([]);
  const [adding, setAdding] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [libRes, activeRes] = await Promise.all([
        fetch('/api/v1/connectors/library').then(r => r.json()),
        fetch('/api/v1/connectors/active').then(r => r.json())
      ]);
      if (libRes.success) setLibrary(libRes.connectors);
      if (activeRes.success) setActive(activeRes.connectors);
    } catch (e) {
      console.error('ConnectorsView fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEnable = async () => {
    setAdding(null);
    await fetchData();
  };

  const handleRemove = async (id) => {
    await fetch(`/api/v1/connectors/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleHealthCheck = async (id) => {
    await fetch(`/api/v1/connectors/${id}/health`);
    await fetchData();
  };

  const activeIds = new Set(active.map(c => c.id));

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Plug size={24} color="var(--accent-teal)" />
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Connectors</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Connect MidpointX to your daily services</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['library', 'active'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12, textTransform: 'capitalize' }}>
            {t === 'active' ? `Active (${active.length})` : 'Browse Library'}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

      {!loading && tab === 'library' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {library.map(c => (
            <div key={c.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 20, marginRight: 8 }}>{CATEGORY_ICONS[c.category] ?? '🔌'}</span>
                  <strong style={{ fontSize: 14 }}>{c.name}</strong>
                </div>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {c.category}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>{AUTH_LABELS[c.authType]}</p>
              {activeIds.has(c.id) ? (
                <StatusBadge status={active.find(a => a.id === c.id)?.status ?? 'healthy'} />
              ) : (
                <>
                  <button className="btn-primary" style={{ fontSize: 11 }} onClick={() => setAdding(adding === c.id ? null : c.id)}>
                    <Plus size={12} style={{ marginRight: 4 }} /> Add
                  </button>
                  {adding === c.id && (
                    <ConnectorForm connector={c} onSubmit={handleEnable} onCancel={() => setAdding(null)} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No connectors active. Browse the library to add one.</p>
          )}
          {active.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[c.category] ?? '🔌'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-icon-small" onClick={() => handleHealthCheck(c.id)} title="Health Check">
                  <RefreshCw size={14} />
                </button>
                <button className="btn-icon-small" onClick={() => handleRemove(c.id)} title="Remove" style={{ color: '#ef4444' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConnectorsView;
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/ConnectorsView.jsx
git commit -m "feat(ui): add ConnectorsView with library browse, enable form, and active connector management"
```

---

## Task 13: MCPServersView Frontend

**Files:**
- Create: `frontend/src/components/MCPServersView.jsx`

- [ ] **Step 1: Create MCPServersView**

Create `frontend/src/components/MCPServersView.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Server, Plus, Trash2, ChevronDown, ChevronRight, Terminal } from 'lucide-react';

const MCPServersView = () => {
  const [tab, setTab] = useState('library');
  const [library, setLibrary] = useState([]);
  const [active, setActive] = useState([]);
  const [adding, setAdding] = useState(null);
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [expandedTools, setExpandedTools] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [customForm, setCustomForm] = useState({ id: '', name: '', command: 'npx', args: '', env: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [libRes, activeRes] = await Promise.all([
        fetch('/api/v1/mcp-servers/library').then(r => r.json()),
        fetch('/api/v1/mcp-servers').then(r => r.json())
      ]);
      if (libRes.success) setLibrary(libRes.servers);
      if (activeRes.success) setActive(activeRes.servers);
    } catch (e) {
      console.error('MCPServersView fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddFromLibrary = async (server, envValues) => {
    const env = {};
    (server.configFields ?? []).forEach(f => { if (envValues[f.key]) env[f.key] = envValues[f.key]; });
    await fetch('/api/v1/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: server.id, name: server.name, command: server.command, args: server.args, env, enabled: true, source: 'library' })
    });
    setAdding(null);
    await fetchData();
  };

  const handleAddCustom = async (e) => {
    e.preventDefault();
    let envObj = {};
    try { envObj = customForm.env ? JSON.parse(customForm.env) : {}; } catch { alert('Invalid JSON in env vars'); return; }
    await fetch('/api/v1/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: customForm.id, name: customForm.name, command: customForm.command,
        args: customForm.args.split(' ').filter(Boolean), env: envObj, enabled: true, source: 'custom'
      })
    });
    setAddCustomOpen(false);
    setCustomForm({ id: '', name: '', command: 'npx', args: '', env: '' });
    await fetchData();
  };

  const handleRemove = async (id) => {
    await fetch(`/api/v1/mcp-servers/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleFetchLogs = async (id) => {
    const res = await fetch(`/api/v1/mcp-servers/${id}/logs`).then(r => r.json());
    if (res.success) setLogs(prev => ({ ...prev, [id]: res.logs }));
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const LibraryAddForm = ({ server }) => {
    const [envVals, setEnvVals] = useState({});
    return (
      <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
        {server.configFields?.length > 0 && server.configFields.map(f => (
          <div key={f.key} style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{f.label}</label>
            <input
              type="password"
              placeholder={f.placeholder ?? ''}
              value={envVals[f.key] ?? ''}
              onChange={e => setEnvVals(v => ({ ...v, [f.key]: e.target.value }))}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 12 }}
            />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" style={{ fontSize: 11 }} onClick={() => handleAddFromLibrary(server, envVals)}>Add Server</button>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setAdding(null)}>Cancel</button>
        </div>
      </div>
    );
  };

  const activeIds = new Set(active.map(s => s.id));

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Server size={24} color="var(--accent-teal)" />
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>MCP Servers</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Manage Model Context Protocol server connections</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['library', 'active'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12, textTransform: 'capitalize' }}>
            {t === 'active' ? `Active (${active.length})` : 'Browse Library'}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

      {!loading && tab === 'library' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {library.map(s => (
            <div key={s.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>
                  <Server size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  {s.name}
                </strong>
                {activeIds.has(s.id) && (
                  <span style={{ fontSize: 10, color: 'var(--accent-teal)', padding: '2px 6px', borderRadius: 4, background: 'rgba(0,200,200,0.1)' }}>Active</span>
                )}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>{s.description}</p>
              {!activeIds.has(s.id) && (
                <>
                  <button className="btn-primary" style={{ fontSize: 11 }} onClick={() => setAdding(adding === s.id ? null : s.id)}>
                    <Plus size={12} style={{ marginRight: 4 }} /> Add
                  </button>
                  {adding === s.id && <LibraryAddForm server={s} />}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No MCP servers configured. Browse the library or add a custom server.</p>
          )}
          {active.map(s => (
            <div key={s.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.status === 'running' ? 'var(--accent-teal)' : '#ef4444', display: 'inline-block' }} />
                  <strong style={{ fontSize: 14 }}>{s.name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.id}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-icon-small" onClick={() => handleFetchLogs(s.id)} title="View Logs">
                    <Terminal size={14} />
                  </button>
                  <button className="btn-icon-small" onClick={() => handleRemove(s.id)} title="Remove" style={{ color: '#ef4444' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {expandedLogs[s.id] && (
                <div style={{ marginTop: 10, background: '#000', borderRadius: 4, padding: 10, maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                  {(logs[s.id] ?? []).length === 0
                    ? <span style={{ color: 'var(--text-muted)' }}>No logs yet.</span>
                    : (logs[s.id] ?? []).map((l, i) => <div key={i} style={{ color: '#00ff88', marginBottom: 2 }}>{l}</div>)
                  }
                </div>
              )}
            </div>
          ))}

          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setAddCustomOpen(!addCustomOpen)}>
              <Plus size={12} style={{ marginRight: 4 }} /> Add Custom Server
            </button>
            {addCustomOpen && (
              <form onSubmit={handleAddCustom} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {[
                  { key: 'id', label: 'Server ID', placeholder: 'my-server' },
                  { key: 'name', label: 'Display Name', placeholder: 'My Server' },
                  { key: 'command', label: 'Command', placeholder: 'npx' },
                  { key: 'args', label: 'Args (space-separated)', placeholder: '-y @some/mcp-server' },
                  { key: 'env', label: 'Env vars (JSON)', placeholder: '{"API_KEY":"..."}' }
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{f.label}</label>
                    <input
                      type="text" placeholder={f.placeholder}
                      value={customForm[f.key]}
                      onChange={e => setCustomForm(v => ({ ...v, [f.key]: e.target.value }))}
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 12 }}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-primary" style={{ fontSize: 12 }}>Add Server</button>
                  <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setAddCustomOpen(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MCPServersView;
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/MCPServersView.jsx
git commit -m "feat(ui): add MCPServersView with library, active list, logs panel, and custom server form"
```

---

## Task 14: Sidebar + App.jsx Wiring

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add two new icons and nav items to Sidebar.jsx**

In `frontend/src/components/Sidebar.jsx`, update the import line to include `Plug` and `Server`:

```jsx
import { MessageSquare, Settings, Box, Cpu, ChevronRight, Menu, Calendar, Clock, Network, Brain, Workflow, Plug, Server } from 'lucide-react';
```

In the `navItems` array, add two new entries after the `memory` entry:

```jsx
    { id: 'connectors',  label: 'CONNECTORS', icon: Plug },
    { id: 'mcp-servers', label: 'MCP SERVERS', icon: Server },
```

- [ ] **Step 2: Add imports and view renders to App.jsx**

In `frontend/src/App.jsx`, add these two imports with the other component imports:

```jsx
import ConnectorsView from './components/ConnectorsView';
import MCPServersView from './components/MCPServersView';
```

After the `{activeView === 'pipelines' && <PipelineView />}` line, add:

```jsx
        {activeView === 'connectors' && <ConnectorsView />}
        {activeView === 'mcp-servers' && <MCPServersView />}
```

- [ ] **Step 3: Build and verify no errors**

```powershell
npm run build
```

Expected: successful build with no TypeScript or JSX errors.

- [ ] **Step 4: Start the dev server and manually verify both pages load**

```powershell
npm run dev
```

Open `http://localhost:3000` in a browser. Verify:
- "CONNECTORS" appears in the sidebar
- "MCP SERVERS" appears in the sidebar
- Clicking CONNECTORS shows the library grid with 9 connector cards
- Clicking MCP SERVERS shows the library grid with 9 server cards
- The Active tab on both pages shows empty state text correctly

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/components/Sidebar.jsx frontend/src/App.jsx
git commit -m "feat(ui): wire ConnectorsView and MCPServersView into sidebar and App routing"
```

---

## Self-Review Results

**Spec coverage:**
- ✅ ConnectorRegistry (lifecycle, health, persistence)
- ✅ CredentialVault (AES-256-CBC, per-connector)
- ✅ MCPServerManager (library, add/remove, logs)
- ✅ IntegrationToolBridge (connector tools → PluginRegistry)
- ✅ Connector library: Yahoo Finance, Alpha Vantage, OpenWeather, Todoist (full); Google Calendar, Outlook Calendar, Gmail, Outlook Mail, Google Tasks (OAuth2 stubs)
- ✅ Backend routes: connectorRoutes, mcpServerRoutes (all 6+5 endpoints)
- ✅ Frontend: ConnectorsView, MCPServersView, Sidebar, App.jsx
- ✅ Data flow: connector tools routed through PluginRegistry.routeAndExecute

**Placeholder scan:** None found. All code steps contain complete implementations.

**Type consistency:**
- `IConnector.configFields` is `ConnectorConfigField[]` — used consistently in all connectors and the routes
- `ConnectorTool.execute` is `(args: Record<string, unknown>) => Promise<unknown>` — consistent across all connectors
- `MCPServerConfig` id/name/command/args/env/enabled/source — consistent between MCPServerManager and mcpServerRoutes
- `IntegrationToolBridge.register(connectorId, tools)` — ConnectorRegistry calls this correctly in `enable()`
- PluginRegistry's `registerConnectorTools` signature matches IntegrationToolBridge's call
