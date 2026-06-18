import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
import { getGoogleAccessToken } from "./googleAuth";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";

export class GoogleCalendarConnector implements IConnector {
  readonly id = "google-calendar";
  readonly name = "Google Calendar";
  readonly category: ConnectorCategory = "calendar";
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
        name: "get_events",
        description: "Get Google Calendar events for a date range",
        inputSchema: { type: "object", properties: { start: { type: "string", description: "ISO 8601 start time" }, end: { type: "string", description: "ISO 8601 end time" } }, required: ["start", "end"] },
        execute: async ({ start, end }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const url = `${BASE}/events?timeMin=${encodeURIComponent(start as string)}&timeMax=${encodeURIComponent(end as string)}&singleEvents=true&orderBy=startTime`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          return await res.json();
        }
      },
      {
        name: "create_event",
        description: "Create a new Google Calendar event",
        inputSchema: { type: "object", properties: { title: { type: "string" }, start: { type: "string", description: "ISO 8601" }, end: { type: "string", description: "ISO 8601" }, description: { type: "string" } }, required: ["title", "start", "end"] },
        execute: async ({ title, start, end, description }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(`${BASE}/events`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ summary: title, description, start: { dateTime: start }, end: { dateTime: end } })
          });
          return await res.json();
        }
      },
      {
        name: "delete_event",
        description: "Delete a Google Calendar event by ID",
        inputSchema: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] },
        execute: async ({ event_id }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          await fetch(`${BASE}/events/${event_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
          return { success: true };
        }
      }
    ];
  }
}
