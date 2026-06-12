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
