export interface InboundEvent {
  source: string;
  channel: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Connector {
  id: string;
  send(channel: string, message: string, options?: Record<string, unknown>): Promise<void>;
  receive(handler: (event: InboundEvent) => void): void;
  healthCheck(): Promise<boolean>;
}

const registry = new Map<string, Connector>();

export const IntegrationBus = {
  register(connector: Connector): void {
    registry.set(connector.id, connector);
    console.log(`[IntegrationBus] Registered connector: ${connector.id}`);
  },

  get(id: string): Connector | undefined {
    return registry.get(id);
  },

  list(): Connector[] {
    return Array.from(registry.values());
  },

  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    await Promise.all(
      Array.from(registry.entries()).map(async ([id, connector]) => {
        try {
          results[id] = await connector.healthCheck();
        } catch {
          results[id] = false;
        }
      })
    );
    return results;
  },

  async send(connectorId: string, channel: string, message: string, options?: Record<string, unknown>): Promise<void> {
    const connector = registry.get(connectorId);
    if (!connector) throw new Error(`[IntegrationBus] Connector not found: ${connectorId}`);
    await connector.send(channel, message, options);
  },
};
