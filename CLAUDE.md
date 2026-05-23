# MidpointX — Project Mandates & Conventions

## Core Identity

This is **MidpointX**, a high-autonomy personal assistant OS for Windows. It is persistent, proactive, and deeply integrated into the user's workflow. The architecture is a stateful LangGraph cognitive loop (15+ actor nodes) with a hardened Docker sandbox for execution, a self-evolving Markdown skill system, and a cryptographically authenticated A2A delegation API.

---

## Operational Mandates

- **Directive 0 (Safety)**: Never modify core OS files (`C:\Windows`, `C:\Program Files`) or delete data without a specific path and clear intent.
- **Directive 1 (Proactivity)**: If you detect a system error or failure in a background project, notify the user immediately.
- **Directive 2 (Privacy)**: Keep all user data local. Only send minimal necessary data to LLMs. Never leak secrets or API keys.
- **Directive 3 (Self-Evolution)**: Every failure is a learning opportunity. Propose a "Logic Shift" theorem whenever a superior pattern is discovered.
- **Surgical Changes**: Always prioritize targeted, minimal edits. Avoid unnecessary refactoring or file-level rewrites when a line-level fix suffices.
- **Verification**: All changes must be verified via `npx tsc --noEmit` and/or `npm test` before committing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | TypeScript 5.4, Node.js 22, Express, Socket.io |
| Cognitive loop | LangGraph (`@langchain/langgraph`) |
| LLM abstraction | LangChain (`@langchain/anthropic`, `@langchain/openai`, `@langchain/google-genai`) |
| Tool protocol | MCP SDK (`@modelcontextprotocol/sdk`) |
| Persistence | Local filesystem (default) or SQLite (`better-sqlite3`) |
| Sandbox | Docker (hardened: `--network=none`, `--cap-drop=ALL`) |
| Desktop automation | `@nut-tree-fork/nut-js` |
| Browser automation | Puppeteer via MCP (per-user isolated) |
| Frontend | React (in `frontend/`) |
| Validation | Zod |
| Testing | Jest + ts-jest |

### Code Conventions

- **Types**: Always prefer explicit types over `any`. The `as any` escape hatch is used only where LangGraph's imperative builder pattern prevents incremental type inference — document it with a comment.
- **Style**: Direct and concise. Skip pleasantries in responses.
- **Structure**: Decouple cognitive labor (Nodes in `src/nodes/`) from mechanical execution (Plugins/MCP in `src/plugins/`). Core orchestration lives in `src/core/`.
- **Errors**: Always show the full error message alongside the fix.
- **Output**: Use structured formats (tables, bullet lists) for results and comparisons.

---

## Development Commands

```powershell
npm run dev          # Start backend + frontend (concurrent)
npm run backend      # Backend only (tsx watch)
npm run ui           # Frontend only (Vite dev server)
npm run build        # Full production build (frontend + tsc)
npm run cli          # CLI interactive mode
npm test             # Run Jest test suite
npx tsc --noEmit     # Type-check without emitting (run after edits)
```

The server starts on **port 5001** by default. The frontend dev server proxies to it.

---

## Key Files & Paths

| Path | Purpose |
|---|---|
| `src/core/config.ts` | Zod-validated env schema — all config fields live here |
| `src/core/graph.ts` | LangGraph state machine — node wiring and edge conditions |
| `src/core/llmFactory.ts` | Multi-provider LLM abstraction (6 providers) |
| `src/core/sandboxManager.ts` | Docker sandbox lifecycle (isDockerAvailable, runInSandbox) |
| `src/core/pluginRegistry.ts` | MCP + skill loader, tool dispatcher, hot-reload |
| `src/core/observer.ts` | Sentinel: cron schedules, filesystem watchers, webhook routing |
| `src/core/persistence.ts` | Local FS and SQLite adapters (same interface) |
| `src/core/protocol.ts` | A2A audit ledger with hash chaining |
| `src/nodes/executionNodes.ts` | SelectionActor + ExecutionActor — all tool dispatch logic |
| `src/nodes/cognitiveNodes.ts` | Reflect, Analyze, Learn, SilentAssessment |
| `src/nodes/skillAcquisitionNode.ts` | Autonomous web research → skill synthesis → hot-reload |
| `src/plugins/skills/` | Markdown skill files (agent's live knowledge base) |
| `src/plugins/mcp/mcp_config.json` | MCP server configuration |
| `.env` | Runtime secrets and feature flags (never commit) |
| `.env.example` | Template — keep in sync with `config.ts` schema |

---

## LLM Provider Switching

Change `ACTIVE_LLM_PROVIDER` in `.env` — no code changes needed:

| Provider | Value | Key variable |
|---|---|---|
| Anthropic (default) | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Google Gemini | `google` | `GEMINI_API_KEY` |
| NVIDIA NIM | `nvidia` | `NVIDIA_API_KEY` |
| Ollama (local) | `local` | *(none)* |

---

## GitHub Repository

- **Remote**: `https://github.com/VectorZen217/MidpointX-G`
- **Main branch**: `main`
- **Feature branches**: `feat/<description>` — always branch off `main`, never commit directly

---

## User Preferences (Randy)

- **Shell**: PowerShell (Win32) — use `powershell.exe` syntax in shell commands
- **Paths**: Always use absolute paths in shell commands
- **Errors**: Show the full error message and the fix together
- **Output**: Use structured formats (tables, bullet lists) for lists and results
- **Commits**: Descriptive `feat:` / `fix:` / `docs:` / `refactor:` prefixes; include *why* not just *what*
