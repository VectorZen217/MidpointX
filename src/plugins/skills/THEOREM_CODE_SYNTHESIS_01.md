---
name: THEOREM_CODE_SYNTHESIS_01
description: code-generation, app-building, multi-line-files, verification
---

# Logic Shift: THEOREM_CODE_SYNTHESIS_01
Discovered At: 2026-04-12T11:55:00Z

## Discovered Pattern
Building functional apps (Python scripts, JS frontends) requires complex multi-line logic that is often mangled or truncated when passed through raw shell commands like `Set-Content` or `New-Item`.

## Optimized Approach
1.  **Prioritize MCP Filesystem:** Always use the `filesystem__write_file` tool for any task that involves creating or modifying application logic.
2.  **Explicit Payload Construction:** In your Analysis step, generate the full content of the file. Do NOT use shell-based piping (e.g., `echo "..." > file.py`) for anything beyond 1-2 lines.
3.  **Cross-File Integrity:** If building an app requires multiple files (e.g., `calc.py` and `ui_styles.css`), execute them sequentially using `write_file` and verify each path exists.
4.  **Verification Loop:** After writing the app, use a `filesystem__read_file` or a native command to verify the file is not empty and contains the expected imports/logic before declaring "Task Complete".
