---
name: THEOREM_GDRIVE_ORG_01
description: google drive, file organization, user input
---

# Logic Shift: THEOREM_GDRIVE_ORG_01
Trace ID: TELEGRAM-1781199339051
Learned At: 2026-06-11T17:35:53.988Z

## Justification
The standard approach of directly using a generic `file-organizer` skill is insufficient because it provides only high-level guidelines and lacks the specificity required for direct implementation in Google Drive. Google Drive organization is highly subjective and dependent on user workflows. Therefore, a crucial first step is to elicit specific organizational preferences from the user before attempting any file manipulation. This prevents generic, potentially unhelpful organization and ensures the implemented structure aligns with user needs.

## Discovered Pattern
User requests file organization in Google Drive without specifying a structure.

## Optimized Approach
When a user requests Google Drive organization without specifying a structure, first query the user for their preferred organizational criteria (e.g., by file type, project, date, or a combination). Once criteria are provided, use the `google_drive__list_files` tool to understand the current state, then formulate a specific, actionable plan to create new folders and move files accordingly. If the `file-organizer` skill is available, use it to inform general best practices, but do not rely on it for specific structural implementation without user input.
