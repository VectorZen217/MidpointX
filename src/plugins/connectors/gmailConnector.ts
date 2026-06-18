import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
import { getGoogleAccessToken } from "./googleAuth";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailConnector implements IConnector {
  readonly id = "gmail";
  readonly name = "Gmail";
  readonly category: ConnectorCategory = "email";
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
        name: "get_inbox",
        description: "Get recent Gmail inbox messages",
        inputSchema: { type: "object", properties: { limit: { type: "number", description: "Max messages to return (default 10)" } } },
        execute: async ({ limit = 10 }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const listRes = await fetch(`${BASE}/messages?labelIds=INBOX&maxResults=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
          const list = await listRes.json() as { messages?: Array<{ id: string }> };
          if (!list.messages) return { messages: [] };
          const messages = await Promise.all(
            list.messages.map(async (m) => {
              const r = await fetch(`${BASE}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${token}` } });
              return await r.json();
            })
          );
          return { messages };
        }
      },
      {
        name: "send",
        description: "Send an email via Gmail",
        inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] },
        execute: async ({ to, subject, body }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const raw = btoa(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`)
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          const res = await fetch(`${BASE}/messages/send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw })
          });
          return await res.json();
        }
      },
      {
        name: "search",
        description: "Search Gmail messages by query",
        inputSchema: { type: "object", properties: { query: { type: "string", description: "Gmail search query (e.g. 'from:user@example.com')" }, limit: { type: "number" } }, required: ["query"] },
        execute: async ({ query, limit = 10 }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(`${BASE}/messages?q=${encodeURIComponent(query as string)}&maxResults=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
          return await res.json();
        }
      }
    ];
  }
}
