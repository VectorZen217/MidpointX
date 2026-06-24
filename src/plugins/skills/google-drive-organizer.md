---
name: google-drive-organizer
description: Manages, organizes, and uploads files and folders within a user's Google Drive using the google_workspace connector tools.
category: domain
---

# Skill: Google Drive Organizer

## Description

This skill enables an AI agent to manage, organize, and upload files and folders in a user's Google Drive. Use it to save reports, create folder structures, and search for existing files.

## Available Tools

All tools are accessed with the `google_workspace__` prefix. These are the real registered tool names:

| Tool | Purpose |
|---|---|
| `google_workspace__upload_file` | Upload a file (HTML, text, etc.) to Drive |
| `google_workspace__create_folder` | Create a new folder in Drive |
| `google_workspace__search_drive` | Search files and folders by name or content |
| `google_workspace__list_drive_files` | List files in a folder (defaults to root) |
| `google_workspace__get_doc` | Read a Google Docs document by ID |
| `google_workspace__get_spreadsheet` | Read a Google Sheets spreadsheet by ID |
| `google_workspace__append_to_sheet` | Append rows to a Google Sheets spreadsheet |

## Tool Schemas

### google_workspace__upload_file

Upload any UTF-8 file content to Google Drive. Returns `id`, `name`, and `webViewLink`.

* **name** (string, required): Filename with extension, e.g. `report.html`
* **content** (string, required): Full file content as a UTF-8 string
* **mime_type** (string, required): MIME type, e.g. `text/html`, `text/plain`, `text/csv`
* **folder_id** (string, optional): Drive folder ID to place the file in; omit for My Drive root

### google_workspace__create_folder

Create a new folder. Returns `id`, `name`, and `webViewLink`.

* **name** (string, required): Folder name
* **parent_folder_id** (string, optional): Parent folder ID; omit for root

### google_workspace__search_drive

Search files or folders by Drive query syntax.

* **query** (string, required): Drive query string, e.g. `name contains 'Report'` or `mimeType = 'application/vnd.google-apps.folder'`
* **limit** (number, optional): Max results to return (default 10)

### google_workspace__list_drive_files

List files in a folder.

* **limit** (number, optional): Max results (default 20)
* **folder_id** (string, optional): Folder ID to list; omit for root

## Execution Protocol

### Saving a File to Drive

1. **(Optional) Create a folder** if one doesn't exist yet:
   - Call `google_workspace__search_drive` with `query="name = 'FolderName' and mimeType = 'application/vnd.google-apps.folder'"` to check.
   - If not found, call `google_workspace__create_folder` to create it and capture the returned `id`.
2. **Upload the file**:
   - Call `google_workspace__upload_file` with the `name`, `content`, `mime_type`, and optionally `folder_id`.
   - Report the returned `webViewLink` to the user so they can open it directly.

### Example: Research → HTML Report → Save to Drive

*User: "Research topic X, write an HTML report, and save it to Google Drive."*

1. Research the topic using web/browser tools.
2. Compose the full HTML string in memory.
3. Call `google_workspace__upload_file`:
   ```
   name: "sioux-indians-report.html"
   content: "<html>...</html>"
   mime_type: "text/html"
   ```
4. Return the `webViewLink` from the response: "Your report has been saved to Drive: [link]"

## Error Handling

* **401 Unauthorized**: Google OAuth credentials are missing or expired. Ask the user to verify `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` in `.env`.
* **403 Forbidden**: The OAuth scope may not include Drive write access. The refresh token must have been granted the `https://www.googleapis.com/auth/drive.file` scope.
* **Rate limits (429)**: Retry with exponential backoff.
