---
name: THEOREM_GOOGLE_WORKSPACE_01
description: google_workspace, tool_availability, error_prevention
---

# Logic Shift: THEOREM_GOOGLE_WORKSPACE_01
Trace ID: TELEGRAM-1781808816221
Learned At: 2026-06-18T18:54:02.794Z

## Justification
The standard approach of directly attempting to use a specific Google Workspace tool (like `google_workspace__create_google_doc`) failed because the entire `google_workspace` toolset was not available. This resulted in an error that did not clearly indicate the root cause (lack of toolset access). This theorem optimizes the process by adding a preliminary check for the toolset's existence, thereby preventing the execution of unavailable specific tools and providing a more accurate and efficient response to the user.

## Discovered Pattern
User asks to interact with Google Docs or Google Drive functionalities.

## Optimized Approach
Before attempting to use specific Google Workspace tools (e.g., `google_workspace__create_google_doc`), first verify the general availability of the `google_workspace` toolset. If the toolset is unavailable, inform the user of the limitation and do not proceed with specific tool calls. This prevents unnecessary error states and provides a clearer initial response.
