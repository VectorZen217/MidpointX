# Phase 3: Integration Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified `IntegrationBus` that wraps Slack, GitHub, email, and the existing Discord/Telegram services under a common `Connector` interface. Register each connector as an MCP tool so agents can call them during task execution. Expose health status and configuration through a new Integrations tab in SettingsView.

**Architecture:** `src/core/integrationBus.ts` is a singleton registry. Each connector module exports a `Connector` object conforming to the interface. `server.ts` initializes the bus at startup. New Express routes at `/api/v1/integrations` expose health and test endpoints to the frontend.

**Tech Stack:** `@slack/web-api` (new), `@octokit/rest` (new), `nodemailer` (new), existing `better-sqlite3`, TypeScript, React.

**Note:** Phase 4 pipeline action nodes (`Send Slack`, `Create GitHub issue`, `Send email`) depend on the connectors built here. Build Phase 3 before attempting Phase 4 integration action nodes.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/integrationBus.ts` | Create | Singleton registry; `register`, `getAll`, `get`, `emit` |
| `src/services/slackService.ts` | Create | Slack connector using `@slack/web-api` |
| `src/services/githubService.ts` | Create | GitHub connector using `@octokit/rest` |
| `src/services/emailService.ts` | Create | Email connector using `nodemailer` |
| `src/core/config.ts` | Modify | Add Slack, GitHub, email config fields |
| `src/core/pluginRegistry.ts` | Modify | Register integration tools as MCP tools |
| `src/routes/integrationRoutes.ts` | Create | `GET /status`, `POST /:id/test` routes |
| `src/server.ts` | Modify | Import IntegrationBus, register connectors, mount routes |
| `frontend/src/components/SettingsView.jsx` | Modify | Add Integrations tab |
| `frontend/src/index.css` | Modify | Integration Hub styles |

---

## Task 1: Install new dependencies

- [ ] **Step 1: Install backend packages**

```powershell
npm install @slack/web-api @octokit/rest nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Verify install**

```powershell
npx tsc --noEmit
```

Expected: no errors from new packages.

- [ ] **Step 3: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore(deps): add @slack/web-api, @octokit/rest, nodemailer for integration hub"
```

---

## Task 2: Add integration config fields

**Files:**
- Modify: `src/core/config.ts`

- [ ] **Step 1: Read config.ts**

Open `src/core/config.ts` and locate the Zod schema definition (look for `z.object({`).

- [ ] **Step 2: Add integration fields to the Zod schema**

Find the `.optional()` section or the end of the schema object and add:

```typescript
// Integration Hub
SLACK_BOT_TOKEN:        z.string().optional(),
SLACK_DEFAULT_CHANNEL:  z.string().default("#general"),
GITHUB_TOKEN:           z.string().optional(),
GITHUB_DEFAULT_REPO:    z.string().optional(),
SMTP_HOST:              z.string().optional(),
SMTP_PORT:              z.coerce.number().default(587),
SMTP_USER:              z.string().optional(),
SMTP_PASS:              z.string().optional(),
SENDGRID_API_KEY:       z.string().optional(),
INTEGRATION_FROM_EMAIL: z.string().optional(),
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Update .env.example**

Add to `.env.example`:
```
# Integration Hub
SLACK_BOT_TOKEN=
SLACK_DEFAULT_CHANNEL=#general
GITHUB_TOKEN=
GITHUB_DEFAULT_REPO=owner/repo
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SENDGRID_API_KEY=
INTEGRATION_FROM_EMAIL=
```

- [ ] **Step 5: Commit**

```powershell
git add src/core/config.ts .env.example
git commit -m "feat(integrations): add Slack, GitHub, email config fields to Zod schema"
```

---

## Task 3: Create IntegrationBus

**Files:**
- Create: `src/core/integrationBus.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/core/integrationBus.ts

export interface InboundEvent {
  connectorId: string;
  channel: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface Connector {
  id: string;
  displayName: string;
  send(channel: string, message: string, options?: Record<string, unknown>): Promise<void>;
  healthCheck(): Promise<boolean>;
}

const _registry = new Map<string, Connector>();

export const IntegrationBus = {
  register(connector: Connector): void {
    _registry.set(connector.id, connector);
    console.log(`🔌 [IntegrationBus] Registered connector: ${connector.id}`);
  },

  get(id: string): Connector | undefined {
    return _registry.get(id);
  },

  getAll(): Connector[] {
    return Array.from(_registry.values());
  },

  async send(connectorId: string, channel: string, message: string, options?: Record<string, unknown>): Promise<void> {
    const connector = _registry.get(connectorId);
    if (!connector) throw new Error(`Connector "${connectorId}" not registered`);
    await connector.send(channel, message, options);
  },

  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [id, connector] of _registry) {
      try {
        results[id] = await connector.healthCheck();
      } catch {
        results[id] = false;
      }
    }
    return results;
  }
};
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/core/integrationBus.ts
git commit -m "feat(integrations): add IntegrationBus singleton connector registry"
```

---

## Task 4: Create Slack connector

**Files:**
- Create: `src/services/slackService.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/services/slackService.ts
import { WebClient } from "@slack/web-api";
import { Config } from "../core/config";
import type { Connector } from "../core/integrationBus";

let _client: WebClient | null = null;

function getClient(): WebClient {
  if (_client) return _client;
  if (!Config.SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN not configured");
  _client = new WebClient(Config.SLACK_BOT_TOKEN);
  return _client;
}

export const SlackConnector: Connector = {
  id: "slack",
  displayName: "Slack",

  async send(channel: string, message: string): Promise<void> {
    const client = getClient();
    const target = channel || Config.SLACK_DEFAULT_CHANNEL || "#general";
    await client.chat.postMessage({ channel: target, text: message });
    console.log(`📨 [Slack] Message sent to ${target}`);
  },

  async healthCheck(): Promise<boolean> {
    if (!Config.SLACK_BOT_TOKEN) return false;
    try {
      const client = getClient();
      const res = await client.auth.test();
      return res.ok === true;
    } catch {
      return false;
    }
  }
};
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/services/slackService.ts
git commit -m "feat(integrations): add Slack connector"
```

---

## Task 5: Create GitHub connector

**Files:**
- Create: `src/services/githubService.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/services/githubService.ts
import { Octokit } from "@octokit/rest";
import { Config } from "../core/config";
import type { Connector } from "../core/integrationBus";

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (_octokit) return _octokit;
  if (!Config.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not configured");
  _octokit = new Octokit({ auth: Config.GITHUB_TOKEN });
  return _octokit;
}

function parseRepo(repo?: string): { owner: string; repoName: string } {
  const target = repo || Config.GITHUB_DEFAULT_REPO || "";
  const [owner, repoName] = target.split("/");
  if (!owner || !repoName) throw new Error(`Invalid repo format "${target}" — expected "owner/repo"`);
  return { owner, repoName };
}

export const GitHubConnector: Connector & {
  createIssue(title: string, body: string, repo?: string): Promise<string>;
  addComment(issueNumber: number, body: string, repo?: string): Promise<void>;
} = {
  id: "github",
  displayName: "GitHub",

  async send(channel: string, message: string): Promise<void> {
    // channel is interpreted as "owner/repo#issue_number" or just "owner/repo" (creates issue)
    const hashIdx = channel.lastIndexOf("#");
    if (hashIdx > 0) {
      const repo = channel.substring(0, hashIdx);
      const issueNumber = parseInt(channel.substring(hashIdx + 1), 10);
      await this.addComment(issueNumber, message, repo);
    } else {
      await this.createIssue("Agent Notification", message, channel);
    }
  },

  async createIssue(title: string, body: string, repo?: string): Promise<string> {
    const { owner, repoName } = parseRepo(repo);
    const octokit = getOctokit();
    const res = await octokit.issues.create({ owner, repo: repoName, title, body });
    console.log(`🐙 [GitHub] Issue created: ${res.data.html_url}`);
    return res.data.html_url;
  },

  async addComment(issueNumber: number, body: string, repo?: string): Promise<void> {
    const { owner, repoName } = parseRepo(repo);
    const octokit = getOctokit();
    await octokit.issues.createComment({ owner, repo: repoName, issue_number: issueNumber, body });
    console.log(`🐙 [GitHub] Comment added to issue #${issueNumber}`);
  },

  async healthCheck(): Promise<boolean> {
    if (!Config.GITHUB_TOKEN) return false;
    try {
      const octokit = getOctokit();
      const res = await octokit.users.getAuthenticated();
      return !!res.data.login;
    } catch {
      return false;
    }
  }
};
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/services/githubService.ts
git commit -m "feat(integrations): add GitHub connector with createIssue and addComment"
```

---

## Task 6: Create email connector

**Files:**
- Create: `src/services/emailService.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/services/emailService.ts
import nodemailer from "nodemailer";
import { Config } from "../core/config";
import type { Connector } from "../core/integrationBus";

function createTransport() {
  if (Config.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      auth: { user: "apikey", pass: Config.SENDGRID_API_KEY }
    });
  }
  if (!Config.SMTP_HOST) throw new Error("No email transport configured (set SMTP_HOST or SENDGRID_API_KEY)");
  return nodemailer.createTransport({
    host: Config.SMTP_HOST,
    port: Config.SMTP_PORT,
    auth: Config.SMTP_USER ? { user: Config.SMTP_USER, pass: Config.SMTP_PASS } : undefined
  });
}

export const EmailConnector: Connector = {
  id: "email",
  displayName: "Email",

  async send(channel: string, message: string, options?: Record<string, unknown>): Promise<void> {
    const transport = createTransport();
    const from = Config.INTEGRATION_FROM_EMAIL || Config.SMTP_USER || "midpointx@localhost";
    await transport.sendMail({
      from,
      to: channel,
      subject: String(options?.subject ?? "MidpointX Notification"),
      text: message
    });
    console.log(`📧 [Email] Message sent to ${channel}`);
  },

  async healthCheck(): Promise<boolean> {
    const hasSmtp = !!(Config.SMTP_HOST && Config.SMTP_USER);
    const hasSendGrid = !!Config.SENDGRID_API_KEY;
    if (!hasSmtp && !hasSendGrid) return false;
    try {
      const transport = createTransport();
      await transport.verify();
      return true;
    } catch {
      return false;
    }
  }
};
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/services/emailService.ts
git commit -m "feat(integrations): add email connector with SendGrid and SMTP support"
```

---

## Task 7: Register connectors in server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add imports**

In `src/server.ts`, after `import { SwarmBus } from "./core/swarmBus";`, add:

```typescript
import { IntegrationBus } from "./core/integrationBus";
import { SlackConnector } from "./services/slackService";
import { GitHubConnector } from "./services/githubService";
import { EmailConnector } from "./services/emailService";
```

- [ ] **Step 2: Register connectors after SwarmBus.init(io)**

After `SwarmBus.init(io);`, add:

```typescript
// Register integration connectors (no-ops if tokens not configured)
IntegrationBus.register(SlackConnector);
IntegrationBus.register(GitHubConnector);
IntegrationBus.register(EmailConnector);
```

- [ ] **Step 3: Mount integration routes**

After `app.use("/api/v1/memories", memoryRoutes);`, add:

```typescript
import { integrationRoutes } from "./routes/integrationRoutes";
// ...
app.use("/api/v1/integrations", integrationRoutes);
```

Note: add the import at the top with the other route imports, not inline.

- [ ] **Step 4: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/server.ts
git commit -m "feat(integrations): register Slack, GitHub, email connectors at startup"
```

---

## Task 8: Create integration API routes

**Files:**
- Create: `src/routes/integrationRoutes.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/routes/integrationRoutes.ts
import { Router, Request, Response } from "express";
import { IntegrationBus } from "../core/integrationBus";

export const integrationRoutes = Router();

/**
 * GET /api/v1/integrations/status
 * Returns health status for all registered connectors.
 */
integrationRoutes.get("/status", async (_req: Request, res: Response) => {
  try {
    const health = await IntegrationBus.healthCheckAll();
    const connectors = IntegrationBus.getAll().map(c => ({
      id: c.id,
      displayName: c.displayName,
      healthy: health[c.id] ?? false
    }));
    res.json({ success: true, connectors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/integrations/:id/test
 * Sends a test message through the specified connector.
 * Body: { channel: string, message?: string }
 */
integrationRoutes.post("/:id/test", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channel, message } = req.body as { channel: string; message?: string };
    if (!channel) return res.status(400).json({ error: "channel is required" });

    await IntegrationBus.send(id, channel, message || "MidpointX integration test — it works!");
    res.json({ success: true, message: `Test message sent via ${id}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/routes/integrationRoutes.ts
git commit -m "feat(integrations): add /api/v1/integrations/status and /test routes"
```

---

## Task 9: Register integrations as MCP tools in PluginRegistry

**Files:**
- Modify: `src/core/pluginRegistry.ts`

- [ ] **Step 1: Read pluginRegistry.ts**

Open `src/core/pluginRegistry.ts` and find where built-in tools are registered (look for a `tools` array or `registerTool` calls).

- [ ] **Step 2: Add integration tool registrations**

Add an import at the top:
```typescript
import { IntegrationBus } from "./integrationBus";
```

Find the section that registers built-in tools and add:
```typescript
// Integration Hub tools — automatically available to agents
{
  name: "slack_send",
  description: "Send a message to a Slack channel. Args: channel (string, e.g. '#general'), message (string).",
  inputSchema: {
    type: "object",
    properties: {
      channel: { type: "string" },
      message: { type: "string" }
    },
    required: ["channel", "message"]
  },
  handler: async (args: { channel: string; message: string }) => {
    await IntegrationBus.send("slack", args.channel, args.message);
    return `Message sent to Slack channel ${args.channel}`;
  }
},
{
  name: "github_create_issue",
  description: "Create a GitHub issue. Args: title (string), body (string), repo (string, optional, 'owner/repo').",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      body:  { type: "string" },
      repo:  { type: "string" }
    },
    required: ["title", "body"]
  },
  handler: async (args: { title: string; body: string; repo?: string }) => {
    const gh = IntegrationBus.get("github") as any;
    const url = await gh.createIssue(args.title, args.body, args.repo);
    return `GitHub issue created: ${url}`;
  }
},
{
  name: "email_send",
  description: "Send an email. Args: to (string, email address), subject (string), message (string).",
  inputSchema: {
    type: "object",
    properties: {
      to:      { type: "string" },
      subject: { type: "string" },
      message: { type: "string" }
    },
    required: ["to", "subject", "message"]
  },
  handler: async (args: { to: string; subject: string; message: string }) => {
    await IntegrationBus.send("email", args.to, args.message, { subject: args.subject });
    return `Email sent to ${args.to}`;
  }
}
```

The exact insertion point depends on the current shape of `pluginRegistry.ts`. Find the array or map where tools are registered and append these three entries.

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/core/pluginRegistry.ts
git commit -m "feat(integrations): register slack_send, github_create_issue, email_send as MCP tools"
```

---

## Task 10: Add Integrations tab to SettingsView

**Files:**
- Modify: `frontend/src/components/SettingsView.jsx`

- [ ] **Step 1: Read current SettingsView.jsx**

Open `frontend/src/components/SettingsView.jsx` to see the current structure (tabs or single panel).

- [ ] **Step 2: Add integration tab state and content**

Add the `IntegrationsTab` sub-component at the top of the file (before the main export):

```jsx
const STATUS_DOT = ({ healthy }) => (
  <span style={{
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: healthy ? 'var(--accent-neon)' : '#FF4757',
    marginRight: 8
  }} />
);

const IntegrationsTab = () => {
  const [connectors, setConnectors] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [testResult, setTestResult] = React.useState(null);
  const [testModal, setTestModal] = React.useState(null); // { id, channel }

  React.useEffect(() => {
    fetch('/api/v1/integrations/status')
      .then(r => r.json())
      .then(d => { setConnectors(d.connectors || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sendTest = async () => {
    if (!testModal) return;
    const res = await fetch(`/api/v1/integrations/${testModal.id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: testModal.channel })
    });
    const data = await res.json();
    setTestResult(data.success ? 'Test sent successfully!' : `Error: ${data.error}`);
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading connectors...</div>;

  return (
    <div className="integrations-tab">
      {connectors.map(c => (
        <div key={c.id} className="integration-row">
          <STATUS_DOT healthy={c.healthy} />
          <span className="integration-name">{c.displayName}</span>
          <span className="integration-status">{c.healthy ? 'Connected' : 'Not configured'}</span>
          <button
            className="integration-test-btn"
            disabled={!c.healthy}
            onClick={() => { setTestModal({ id: c.id, channel: '' }); setTestResult(null); }}
          >
            Test
          </button>
        </div>
      ))}

      {testModal && (
        <div className="memory-modal-overlay" onClick={() => setTestModal(null)}>
          <div className="memory-modal" onClick={e => e.stopPropagation()}>
            <div className="memory-modal-header">
              <span>Test {testModal.id}</span>
              <button onClick={() => setTestModal(null)}>✕</button>
            </div>
            <input
              className="memory-modal-input"
              placeholder={testModal.id === 'slack' ? '#general' : testModal.id === 'github' ? 'owner/repo' : 'email@example.com'}
              value={testModal.channel}
              onChange={e => setTestModal(m => ({ ...m, channel: e.target.value }))}
            />
            {testResult && <div style={{ fontSize: 12, color: testResult.startsWith('Error') ? '#FF4757' : 'var(--accent-neon)' }}>{testResult}</div>}
            <button className="memory-modal-save" onClick={sendTest}>Send Test</button>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Add IntegrationsTab to the SettingsView tabs**

In the main `SettingsView` component, add an "Integrations" tab entry to the tab list and render `<IntegrationsTab />` when that tab is active. The exact implementation depends on whether SettingsView already uses tabs. If it's a single-panel view, wrap it in a tab structure:

```jsx
// Add to tab state:
const [settingsTab, setSettingsTab] = React.useState('general');

// Add tab buttons near the top of the settings view render:
<div className="settings-tabs">
  <button className={settingsTab === 'general' ? 'active' : ''} onClick={() => setSettingsTab('general')}>General</button>
  <button className={settingsTab === 'integrations' ? 'active' : ''} onClick={() => setSettingsTab('integrations')}>Integrations</button>
</div>

// In the render output, wrap existing content:
{settingsTab === 'general' && /* existing settings content */}
{settingsTab === 'integrations' && <IntegrationsTab />}
```

- [ ] **Step 4: Add integration styles to index.css**

Append to `frontend/src/index.css`:
```css
/* ============================================================
   INTEGRATION HUB
   ============================================================ */

.integrations-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.integration-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(255,255,255,0.02);
}

.integration-name {
  font-size: 13px;
  font-weight: 600;
  min-width: 80px;
}

.integration-status {
  font-size: 11px;
  color: var(--text-secondary);
  flex: 1;
}

.integration-test-btn {
  background: rgba(23,113,201,0.15);
  border: 1px solid var(--accent-teal);
  color: var(--accent-teal);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
}

.integration-test-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--border);
}

.settings-tabs button {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 6px 12px;
  cursor: pointer;
}

.settings-tabs button.active {
  color: var(--accent-teal);
  border-bottom-color: var(--accent-teal);
}
```

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/components/SettingsView.jsx frontend/src/index.css
git commit -m "feat(integrations): add Integrations tab to SettingsView with health status and test send"
```

---

## Task 11: Verify the full feature

- [ ] **Step 1: Full type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Build frontend**

```powershell
cd frontend; npm run build; cd ..
```

- [ ] **Step 3: Start the app**

```powershell
npm run dev
```

- [ ] **Step 4: Verify Integrations tab**

Open `http://localhost:5001`. Navigate to CONFIG → Integrations tab. Expected: three connectors listed (Slack, GitHub, Email) all showing red dots (not configured) unless tokens are set in `.env`.

- [ ] **Step 5: Configure one connector and test**

Add `SLACK_BOT_TOKEN=xoxb-...` to `.env`, restart the server. The Slack connector should show a green dot. Click Test, enter `#general`, click Send Test. Expected: test message appears in the Slack channel.

- [ ] **Step 6: Final commit**

```powershell
git add -A
git commit -m "feat(phase3): complete Integration Hub — Slack, GitHub, email connectors, MCP tools, settings UI"
```
