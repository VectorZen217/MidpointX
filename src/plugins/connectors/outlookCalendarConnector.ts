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
