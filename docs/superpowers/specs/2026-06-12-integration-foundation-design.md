# MidpointX Integration Foundation — Design Spec
**Date:** 2026-06-12  
**Status:** Approved  
**Goal:** Build the foundation layer that transforms MidpointX into a super-agent — a persistent personal assistant that manages the host system, builds applications, and handles daily tasks across any user's environment.

---

## Vision

The user interacts with MidpointX through Telegram (primary), the web UI, and voice. They ask things like "what's on my calendar today?", "check my email", "how are my stocks?", "plan dinner", "build me a webpage." MidpointX handles all of it — but only if it is connected to the right services.

This spec defines the **foundation layer**: the connector library, MCP server manager, credential vault, and frontend UI that makes all future capabilities possible. Nothing useful gets built without this.

**Construction analogy:** Foundation → Frame → Roof. This spec is the foundation.

---

## Architecture Overview

Four backend components and two frontend pages. Nothing in the cognitive loop (graph.ts) changes.

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT COGNITIVE LOOP                      │
│         (graph.ts — unchanged)                               │
│                          ▲                                   │
│                          │ calls tools                       │
│                 PluginRegistry (existing)                    │
│                          ▲                                   │
│              ┌───────────┴────────────┐                     │
│              │                        │                      │
│   IntegrationToolBridge        MCPServerManager              │
│   (connector tools → registry) (MCP tools → registry)       │
│              ▲                        ▲                      │
│   ConnectorRegistry            mcp_config.json               │
│   + CredentialVault            (dynamic, UI-managed)         │
└─────────────────────────────────────────────────────────────┘
```

The agent gains new capabilities automatically when a connector or MCP server is enabled. No changes to the graph, nodes, or prompt builder.

---

## Component 1: ConnectorRegistry

**File:** `src/core/connectorRegistry.ts`

Manages the full lifecycle of user-enabled connectors: loading, credential storage, health monitoring, and hot-swap.

### Connector Interface

Every connector implements this interface:

```typescript
interface IConnector {
  id: string;                    // 'google-calendar'
  name: string;                  // 'Google Calendar'
  category: ConnectorCategory;   // 'calendar' | 'email' | 'finance' | 'tasks' | 'communication' | 'weather'
  authType: 'oauth2' | 'apikey' | 'basic' | 'none';
  configSchema: ZodSchema;       // exact credentials shape required

  connect(credentials: Record<string, string>): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getTools(): ConnectorTool[];   // capabilities exposed to the agent
}
```

### ConnectorTool

Each tool a connector exposes becomes a standard agent tool:

```typescript
interface ConnectorTool {
  name: string;        // 'calendar_get_events'
  description: string;
  inputSchema: ZodSchema;
  execute(args: Record<string, unknown>): Promise<unknown>;
}
```

### Registry Responsibilities
- Load enabled connectors on startup from `src/workspace/connectors.json`
- Call `connect()` with stored credentials from `CredentialVault`
- Run `healthCheck()` every 5 minutes; mark degraded connectors
- On enable: validate credentials, call `connect()`, register tools, persist config
- On disable: call `disconnect()`, unregister tools, remove from config
- Hot-swap: replacing Google Calendar with Outlook Calendar requires no restart

---

## Component 2: CredentialVault

**File:** `src/core/credentialVault.ts`

Encrypted per-user credential storage. Extends the existing `secretProvider.ts` pattern.

- Credentials stored in `src/workspace/credentials.enc.json` (AES-256-CBC, key derived from `CREDENTIAL_KEY` env var)
- Read/write interface: `store(connectorId, credentials)`, `retrieve(connectorId)`, `delete(connectorId)`
- Credentials never logged, never sent to LLM
- OAuth2 tokens stored with expiry; auto-refresh on expiry before connector calls

---

## Component 3: MCPServerManager

**File:** `src/core/mcpServerManager.ts`

Manages MCP server processes dynamically. Replaces the static `mcp_config.json` approach with a UI-managed, lifecycle-aware system.

### Server Config Record

```typescript
interface MCPServerConfig {
  id: string;           // 'github'
  name: string;         // 'GitHub'
  command: string;      // 'npx'
  args: string[];       // ['-y', '@modelcontextprotocol/server-github']
  env: Record<string, string>;  // { GITHUB_TOKEN: '...' }
  enabled: boolean;
  source: 'library' | 'custom';
}
```

### Responsibilities
- On startup: spawn all enabled servers, discover their tools via MCP protocol, register in `PluginRegistry`
- On add: spawn new server, discover tools, register, persist to `mcp_config.json`
- On remove: stop process, unregister tools, remove from config
- Auto-restart crashed servers (max 3 attempts, then mark failed)
- Stream logs per server (last 200 lines in memory, exposed via API)

### MCP Server Library (curated, pre-configured)

| ID | Name | Package | Config Required |
|---|---|---|---|
| `filesystem` | Filesystem | `@modelcontextprotocol/server-filesystem` | Root path |
| `github` | GitHub | `@modelcontextprotocol/server-github` | GitHub token |
| `brave-search` | Brave Search | `@modelcontextprotocol/server-brave-search` | Brave API key |
| `sqlite` | SQLite | `@modelcontextprotocol/server-sqlite` | DB file path |
| `memory` | Knowledge Graph | `@modelcontextprotocol/server-memory` | None |
| `puppeteer` | Puppeteer Browser | `@modelcontextprotocol/server-puppeteer` | None |
| `slack` | Slack | `@modelcontextprotocol/server-slack` | Bot token |
| `google-maps` | Google Maps | `@modelcontextprotocol/server-google-maps` | Maps API key |
| `postgres` | PostgreSQL | `@modelcontextprotocol/server-postgres` | Connection string |

---

## Component 4: IntegrationToolBridge

**File:** `src/core/integrationToolBridge.ts`

Translates active connector capabilities into standard tool definitions and registers them in `PluginRegistry`. Called by `ConnectorRegistry` whenever a connector is enabled or disabled.

- Wraps each `ConnectorTool` as a `PluginTool` (existing interface)
- Always namespaces tool names by full connector ID: `google-calendar` connector's `get_events` → `google_calendar_get_events`, Gmail's `get_inbox` → `gmail_get_inbox`. This ensures two active calendar connectors (e.g. Google + Outlook) never collide.
- On connector health degraded: marks tools as unavailable (agent gets informative error instead of hang)
- On connector re-healthy: re-registers tools automatically

---

## Connector Library (Phase 1)

Nine connectors covering the core daily workflow use cases. Each normalizes its data into shared types so the agent gets consistent output regardless of provider.

### Shared Data Types

```typescript
type CalendarEvent = { id: string; title: string; start: Date; end: Date; location?: string; };
type EmailMessage  = { id: string; from: string; subject: string; snippet: string; date: Date; };
type MarketPrice   = { symbol: string; price: number; change: number; changePercent: number; };
type Task          = { id: string; title: string; due?: Date; completed: boolean; priority?: string; };
```

### Connectors

| Connector | ID | Category | Auth | Tools Exposed |
|---|---|---|---|---|
| Google Calendar | `google-calendar` | calendar | OAuth2 | `calendar_get_events`, `calendar_create_event`, `calendar_delete_event` |
| Outlook Calendar | `outlook-calendar` | calendar | OAuth2 | `calendar_get_events`, `calendar_create_event`, `calendar_delete_event` |
| Gmail | `gmail` | email | OAuth2 | `email_get_inbox`, `email_send`, `email_search` |
| Outlook Mail | `outlook-mail` | email | OAuth2 | `email_get_inbox`, `email_send`, `email_search` |
| Yahoo Finance | `yahoo-finance` | finance | none | `finance_get_price`, `finance_get_watchlist`, `finance_get_news` |
| Alpha Vantage | `alpha-vantage` | finance | apikey | `finance_get_price`, `finance_get_portfolio_value` |
| OpenWeather | `openweather` | weather | apikey | `weather_current`, `weather_forecast` |
| Google Tasks | `google-tasks` | tasks | OAuth2 | `tasks_get_list`, `tasks_create`, `tasks_complete` |
| Todoist | `todoist` | tasks | apikey | `tasks_get_list`, `tasks_create`, `tasks_complete` |

### Tool naming: always connector-prefixed
Tools are always named with the full connector ID: `google_calendar_get_events`, `outlook_calendar_get_events`, `gmail_get_inbox`, `todoist_tasks_create`. This means multiple connectors of the same category can be active simultaneously with no collision — a user with both Google Calendar and Outlook Calendar gets both tool sets, and the agent can query either or both.

---

## Frontend: Two New Sidebar Pages

### Sidebar Update

```
💬  Chat
🧠  Memory
🔌  Connectors       ← new
⚙️   MCP Servers      ← new
🔀  Pipelines
🐝  Swarm
⚙️   Settings
```

### Connectors Page (`/connectors`)

Two tabs: **Browse Library** and **Active**.

**Browse Library tab:**
- Card grid of all available connectors
- Each card: icon, name, category badge, auth type, short description, `[+ Add]` button
- Clicking `[+ Add]` opens a credential form (fields derived from connector's `configSchema`)
- OAuth2 connectors open browser OAuth flow; API key connectors show a text input

**Active tab:**
- List of enabled connectors with health indicator (● healthy / ⚠ degraded / ✕ failed)
- `[Configure]` to update credentials
- `[Remove]` to disconnect and remove

### MCP Servers Page (`/mcp-servers`)

Two tabs: **Browse Library** and **Active**.

**Browse Library tab:**
- Card grid of curated MCP servers
- Each card: icon, name, tool count, short description, `[+ Add]` button
- Clicking `[+ Add]` opens config form (required env vars / paths)

**Active tab:**
- List of running servers with status (● running / ✕ failed)
- Tool count badge — expandable `[Tools ▾]` to see all tool names
- `[Logs]` button — opens live log panel (last 200 lines, auto-scroll)
- `[Stop]` / `[Start]` toggle
- `[Remove]` to permanently remove

**`[+ Add Custom Server]` button** (bottom of Active tab):
- Manual form: name, command, args, env vars
- For power users wiring in servers not in the library

---

## Backend API Routes

### Connector Routes (`src/routes/connectorRoutes.ts`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/connectors/library` | Full catalog of available connectors |
| `GET` | `/api/v1/connectors/active` | Enabled connectors with health status |
| `POST` | `/api/v1/connectors/:id/enable` | Configure credentials and activate |
| `POST` | `/api/v1/connectors/:id/disable` | Deactivate (keep credentials) |
| `DELETE` | `/api/v1/connectors/:id` | Remove connector and credentials |
| `GET` | `/api/v1/connectors/:id/health` | Force health check, return status |

### MCP Server Routes (`src/routes/mcpServerRoutes.ts`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/mcp-servers/library` | Curated server catalog |
| `GET` | `/api/v1/mcp-servers` | Active servers with tool counts and status |
| `POST` | `/api/v1/mcp-servers` | Add and start a server |
| `PUT` | `/api/v1/mcp-servers/:id` | Update config and restart |
| `DELETE` | `/api/v1/mcp-servers/:id` | Stop and remove |
| `POST` | `/api/v1/mcp-servers/:id/restart` | Restart a server |
| `GET` | `/api/v1/mcp-servers/:id/logs` | Fetch recent log lines |

---

## Data Flow: End-to-End Example

**"What's on my calendar today?"** via Telegram:

1. User sends message → `TelegramService.handleIntent()`
2. `ChannelRouter.route()` → cognitive loop starts
3. `AnalysisActor` generates plan: `["call calendar_get_events for today's date range"]`
4. `SelectionActor` finds `calendar_get_events` in `PluginRegistry`
   - Tool was registered by `IntegrationToolBridge` from the active Google Calendar connector
5. `ExecutionActor` calls `calendar_get_events({ start: today, end: today })`
   - `IntegrationToolBridge` delegates to `GoogleCalendarConnector.getTools()[0].execute()`
   - Connector calls Google Calendar API with stored OAuth token
   - Returns `CalendarEvent[]`
6. Agent formats response, sends back to Telegram

The agent has no knowledge of Google vs Outlook. It calls a tool, gets normalized data.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Connector health check fails | Mark degraded, agent receives "connector unavailable" error instead of hang |
| OAuth token expired | Auto-refresh before call; if refresh fails, notify user via Telegram to re-authenticate |
| MCP server crashes | Auto-restart up to 3 times; if still failing, mark failed and notify user |
| Credential decryption fails | Log error, disable connector, prompt user to reconfigure |
| User calls tool with no connector for that category | Agent receives clear error: "No calendar connector is active. Enable one in Connectors." |

---

## Persistence

| What | Where |
|---|---|
| Enabled connectors + config | `src/workspace/connectors.json` |
| Encrypted credentials | `src/workspace/credentials.enc.json` |
| MCP server configs | `src/plugins/mcp/mcp_config.json` (existing, now UI-managed) |

---

## What This Enables (The Frame and Roof)

Once this foundation is in place, the next phases build directly on top:

- **Phase 2 — Morning Briefing:** A skill fires at a user-configured time, calls `calendar_get_events`, `email_get_inbox`, `finance_get_watchlist`, `weather_current`, assembles a summary, and pushes it to Telegram. Zero new infrastructure needed.
- **Phase 3 — Daily Task Management:** `tasks_get_list`, `tasks_create`, `tasks_complete` already registered. Build a planning skill on top.
- **Phase 4 — Voice Interface:** STT/TTS wired to existing `TelegramService` voice handler. Connectors already provide the data.
- **Phase 5 — Multi-channel:** Discord, Slack channels follow the same `ChannelRouter` pattern as Telegram.

---

## Out of Scope (This Spec)

- OAuth2 redirect URI handler — deferred to Phase 2. A backend endpoint (`GET /api/v1/auth/callback/:connectorId`) is required to complete OAuth flows. Phase 2 specs this alongside the first OAuth connector (Google Calendar). Until then, OAuth connectors are in the library but show "OAuth setup required" instead of a credential form.
- Mobile app — out of scope entirely
- Multi-user credential isolation beyond per-userId namespacing — deferred
- Connector marketplace / community submissions — deferred
