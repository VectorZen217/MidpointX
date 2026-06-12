import { ConnectorRegistry, IConnector, ConnectorTool } from "../core/connectorRegistry";

function makeStubConnector(id: string, healthy = true): IConnector {
  return {
    id,
    name: `Stub ${id}`,
    category: "finance" as const,
    authType: "none" as const,
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

// Mock IntegrationToolBridge to avoid import errors during tests
// { virtual: true } allows mocking a module that doesn't exist on disk yet (Task 4)
jest.mock("../core/integrationToolBridge", () => ({
  IntegrationToolBridge: {
    register: jest.fn(),
    unregister: jest.fn(),
    markDegraded: jest.fn(),
    markHealthy: jest.fn(),
  }
}), { virtual: true });

beforeEach(() => {
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
