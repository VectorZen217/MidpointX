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
