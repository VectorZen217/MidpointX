# Error Log

## SIG-20260514-001
- **Timestamp:** 2026-05-14T08:55:00-05:00
- **Context:** MCP Server Initialization Failure on Windows
- **Error:** `ENOENT` / `EINVAL` when spawning MCP servers with `npx` / `uvx` through `StdioClientTransport`. Connection timeout due to 15-second limit not allowing `npx -y` downloads.
- **Root Cause:** Node.js CVE-2024-27980 restricts spawning `.bat` and `.cmd` without `shell: true`.
- **Resolution:** Wrapped MCP server commands in `cmd.exe /d /s /c` for `win32` platform and increased the connection timeout to 60s in `src/core/pluginRegistry.ts`.
