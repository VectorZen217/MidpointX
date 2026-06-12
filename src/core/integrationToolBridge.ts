import { PluginRegistry } from "./pluginRegistry";
import { ConnectorTool } from "./connectorRegistry";

export class IntegrationToolBridge {
  private static degraded: Set<string> = new Set();

  static register(connectorId: string, tools: ConnectorTool[]): void {
    const prefix = connectorId.replace(/-/g, "_");
    const declarations = tools.map(t => ({
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
