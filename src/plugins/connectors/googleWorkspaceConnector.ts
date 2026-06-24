import { IConnector, ConnectorCategory, AuthType, ConnectorTool, ConnectorConfigField } from "../../core/connectorRegistry";
import { getGoogleAccessToken } from "./googleAuth";

export class GoogleWorkspaceConnector implements IConnector {
  readonly id = "google-workspace";
  readonly name = "Google Workspace";
  readonly category: ConnectorCategory = "productivity";
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
        name: "search_drive",
        description: "Search Google Drive files by name or content",
        inputSchema: { type: "object", properties: { query: { type: "string", description: "Drive search query (e.g. 'name contains \"report\"')" }, limit: { type: "number" } }, required: ["query"] },
        execute: async ({ query, limit = 10 }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query as string)}&pageSize=${limit}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return await res.json();
        }
      },
      {
        name: "list_drive_files",
        description: "List recent Google Drive files",
        inputSchema: { type: "object", properties: { limit: { type: "number" }, folder_id: { type: "string", description: "Folder ID to list (default: root)" } } },
        execute: async ({ limit = 20, folder_id }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const q = folder_id ? `'${folder_id}' in parents` : "'root' in parents";
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${limit}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return await res.json();
        }
      },
      {
        name: "get_doc",
        description: "Read a Google Docs document by ID",
        inputSchema: { type: "object", properties: { doc_id: { type: "string" } }, required: ["doc_id"] },
        execute: async ({ doc_id }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(`https://docs.googleapis.com/v1/documents/${doc_id}`, { headers: { Authorization: `Bearer ${token}` } });
          return await res.json();
        }
      },
      {
        name: "get_spreadsheet",
        description: "Read a Google Sheets spreadsheet by ID",
        inputSchema: { type: "object", properties: { sheet_id: { type: "string" }, range: { type: "string", description: "A1 notation range (e.g. Sheet1!A1:D10)" } }, required: ["sheet_id"] },
        execute: async ({ sheet_id, range = "A1:Z100" }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}/values/${encodeURIComponent(range as string)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return await res.json();
        }
      },
      {
        name: "append_to_sheet",
        description: "Append rows to a Google Sheets spreadsheet",
        inputSchema: { type: "object", properties: { sheet_id: { type: "string" }, range: { type: "string" }, values: { type: "array", description: "2D array of values to append", items: { type: "array", items: { type: "string" } } } }, required: ["sheet_id", "range", "values"] },
        execute: async ({ sheet_id, range, values }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const res = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}/values/${encodeURIComponent(range as string)}:append?valueInputOption=USER_ENTERED`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values })
            }
          );
          return await res.json();
        }
      },
      {
        name: "upload_file",
        description: "Upload a file (e.g. HTML, text, PDF) to Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Filename including extension (e.g. report.html)" },
            content: { type: "string", description: "File content as a UTF-8 string" },
            mime_type: { type: "string", description: "MIME type (e.g. text/html, text/plain)" },
            folder_id: { type: "string", description: "Parent folder ID (optional, defaults to My Drive root)" }
          },
          required: ["name", "content", "mime_type"]
        },
        execute: async ({ name, content, mime_type, folder_id }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const metadata: Record<string, unknown> = {
            name,
            mimeType: mime_type,
            ...(folder_id ? { parents: [folder_id] } : {})
          };
          const boundary = "boundary_midpointx";
          const body = [
            `--${boundary}`,
            "Content-Type: application/json; charset=UTF-8",
            "",
            JSON.stringify(metadata),
            `--${boundary}`,
            `Content-Type: ${mime_type}`,
            "",
            content as string,
            `--${boundary}--`
          ].join("\r\n");
          const res = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": `multipart/related; boundary=${boundary}`
              },
              body
            }
          );
          return await res.json();
        }
      },
      {
        name: "create_folder",
        description: "Create a new folder in Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Folder name" },
            parent_folder_id: { type: "string", description: "Parent folder ID (optional, defaults to root)" }
          },
          required: ["name"]
        },
        execute: async ({ name, parent_folder_id }: Record<string, unknown>) => {
          const token = await getGoogleAccessToken();
          const metadata: Record<string, unknown> = {
            name,
            mimeType: "application/vnd.google-apps.folder",
            ...(parent_folder_id ? { parents: [parent_folder_id] } : {})
          };
          const res = await fetch(
            "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(metadata)
            }
          );
          return await res.json();
        }
      }
    ];
  }
}
