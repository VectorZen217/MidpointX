---
name: THEOREM_FS_02
description: filesystem, theorem management, search
---

# Logic Shift: THEOREM_FS_02
Trace ID: TELEGRAM-1778704593523
Learned At: 2026-05-13T20:36:50.744Z

## Justification
The standard approach of expecting a specific file name (e.g., 'THEOREM_FS_02') to be present in the root directory is insufficient when the file's location or exact name is uncertain. `filesystem__search_files` provides a more robust method for discovering relevant files across a directory structure, ensuring that the agent can locate and update theorems even if their naming conventions or locations deviate from initial assumptions.

## Discovered Pattern
Searching for theorem files within a project directory when the exact file path is unknown.

## Optimized Approach
Utilize `filesystem__search_files` with a broad pattern (e.g., '*.json' or '*theorem*') to locate potential theorem files within a given directory and its subdirectories, rather than relying on `filesystem__list_directory` for a specific, potentially non-existent file.
