---
name: THEOREM_GSW_01
description: Google Workspace, File Upload, Integration
---

# Logic Shift: THEOREM_GSW_01
Trace ID: 
Learned At: 2026-06-23T21:56:20.792Z

## Justification
The standard approach might involve generic file operations. However, the `google_workspace__upload_file` tool is purpose-built for this integration, offering a more direct, efficient, and potentially more robust method for saving files within the Google ecosystem. Codifying this ensures the most appropriate tool is selected for Google Workspace-related file storage tasks.

## Discovered Pattern
Uploading a file to Google Drive using a specific tool, e.g., google_workspace__upload_file, when the user explicitly requests Google Workspace integration.

## Optimized Approach
When a user requests to save a file to Google Drive or integrate with Google Workspace, directly use the `google_workspace__upload_file` tool. Avoid generic file-saving methods if this tool is available and suitable.
