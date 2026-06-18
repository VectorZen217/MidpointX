import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
import { getGoogleAccessToken } from "./googleAuth";

const BASE = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";

export class GoogleTasksConnector implements IConnector {
  readonly id = "google-tasks";
  readonly name = "Google Tasks";
  readonly category: ConnectorCategory = "tasks";
  readonly authType: AuthType = "none";
  readonly configFields: ConnectorConfigField[] = [];

  async connect(_credentials: Record<string, string>): Promise<void> {
    await getGoogleAccessToken();
  }

  async disconnect(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    try { await getGoogleAccessToken(); return true; } catch { return false; }
  }

  getTools(): ConnectorTool[] {
    return [
      {
        name: "list_tasks",
        description: "List tasks from Google Tasks default list",
        inputSchema: { type: "object", properties: { show_completed: { type: "boolean" } } },
        execute: async ({ show_completed = false }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(`${BASE}?showCompleted=${show_completed}&showHidden=${show_completed}`, { headers: { Authorization: `Bearer ${token}` } });
          return await res.json();
        }
      },
      {
        name: "create_task",
        description: "Create a new task in Google Tasks",
        inputSchema: { type: "object", properties: { title: { type: "string" }, notes: { type: "string" }, due: { type: "string", description: "RFC 3339 timestamp" } }, required: ["title"] },
        execute: async ({ title, notes, due }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(BASE, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ title, notes, due })
          });
          return await res.json();
        }
      },
      {
        name: "complete_task",
        description: "Mark a Google Task as completed",
        inputSchema: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] },
        execute: async ({ task_id }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(`${BASE}/${task_id}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" })
          });
          return await res.json();
        }
      }
    ];
  }
}
