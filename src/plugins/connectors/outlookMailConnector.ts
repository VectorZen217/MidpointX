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
