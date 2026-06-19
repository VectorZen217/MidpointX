# Recommendations + Google Workspace Access Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all four post-testing recommendations (HMAC A2A signing, FTS5 memory search, config schema additions, Google OAuth config wiring) and verify live access to Gmail, Drive, Docs, Sheets, Calendar, and Tasks using the credentials in `.env`.

**Architecture:** Each task is a targeted, surgical edit to one file. Google access verification uses a single standalone `npx tsx` script that calls `getGoogleAccessToken()` then probes each API endpoint directly — no server needed. FTS5 replaces the LIKE fallback in `recall()` but leaves semantic recall untouched.

**Tech Stack:** TypeScript 5.4, Node.js 22, better-sqlite3 (FTS5), Node.js `crypto.createHmac`, Google OAuth2 REST API.

## Global Constraints

- No new npm packages — use only already-installed deps (`crypto` is Node built-in; FTS5 is bundled in SQLite via `better-sqlite3`)
- Surgical edits only — no file-level rewrites
- Run `npx tsc --noEmit` and `npm test` after each task before committing
- Never log or print the actual secret values of `GOOGLE_CLIENT_SECRET` or `GOOGLE_REFRESH_TOKEN`
- Docker note: Start Docker Desktop manually (`docker desktop start`) — cannot be scripted from this context

---

## File Map

| File | Change |
|------|--------|
| `src/core/config.ts` | Add `BRAVE_API_KEY`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` to Zod schema |
| `src/core/protocol.ts` | Add `delegateWithSignature()` + `verifyDelegation()` using `crypto.createHmac("sha256", key)` |
| `src/core/agentMemory.ts` | Add FTS5 virtual table `agent_memories_fts`, replace LIKE fallback in `recall()` with FTS query |
| `tests/fullCapability.test.ts` | Add test assertions for new config fields + HMAC + FTS presence |
| `scripts/test-google-access.ts` | New script: token refresh + probe each Google API, print structured results |

---

## Task 1: Config Schema — Add Missing Keys

**Files:**
- Modify: `src/core/config.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `Config.BRAVE_API_KEY`, `Config.GOOGLE_MAPS_API_KEY`, `Config.GOOGLE_CLIENT_ID`, `Config.GOOGLE_CLIENT_SECRET`, `Config.GOOGLE_REFRESH_TOKEN` — all `z.string().optional()`

- [ ] **Step 1: Add fields to ConfigSchema in `src/core/config.ts`**

After the `SMTP_PASS` line, add:

```typescript
  BRAVE_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
```

- [ ] **Step 2: Add fields to `.env.example`**

After the Google OAuth section already present, confirm `GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`, `GOOGLE_REFRESH_TOKEN=` lines exist (they already do in `.env.example`). Add `BRAVE_API_KEY` and `GOOGLE_MAPS_API_KEY` if missing:

```
BRAVE_API_KEY=           # Required for brave-search MCP server
GOOGLE_MAPS_API_KEY=     # Required for google-maps MCP server
```

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git add src/core/config.ts .env.example
git commit -m "feat(config): add BRAVE_API_KEY, GOOGLE_MAPS_API_KEY, and Google OAuth fields to Zod schema"
```

---

## Task 2: A2A HMAC-SHA256 Delegation Signing

**Files:**
- Modify: `src/core/protocol.ts`

**Interfaces:**
- Produces:
  ```typescript
  A2AProtocol.delegateWithSignature(agentId: string, task: string, key?: string): { payload: string; signature: string }
  A2AProtocol.verifyDelegation(payload: string, signature: string, key?: string): boolean
  ```
- `key` defaults to `process.env.WEBHOOK_SECRET ?? "midpointx-dev-key"` — callers can override

- [ ] **Step 1: Add `delegateWithSignature` and `verifyDelegation` to `A2AProtocol` class in `src/core/protocol.ts`**

Add after the `validate()` method:

```typescript
  /**
   * Creates an HMAC-SHA256 signed delegation token for inter-agent calls.
   * key: shared secret; defaults to WEBHOOK_SECRET or a dev fallback.
   */
  static delegateWithSignature(
    agentId: string,
    task: string,
    key?: string
  ): { payload: string; signature: string } {
    const secret = key ?? process.env.WEBHOOK_SECRET ?? "midpointx-dev-key";
    const payload = JSON.stringify({ agentId, task, issuedAt: Date.now() });
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return { payload, signature };
  }

  /**
   * Returns true if the signature is a valid HMAC-SHA256 of the payload.
   */
  static verifyDelegation(
    payload: string,
    signature: string,
    key?: string
  ): boolean {
    const secret = key ?? process.env.WEBHOOK_SECRET ?? "midpointx-dev-key";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    // Constant-time compare to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  }
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Run tests**

```
npm test -- --forceExit
```
Expected: 300 passed.

- [ ] **Step 4: Commit**

```
git add src/core/protocol.ts
git commit -m "feat(a2a): add HMAC-SHA256 delegateWithSignature and verifyDelegation methods"
```

---

## Task 3: FTS5 Full-Text Search for AgentMemory

**Files:**
- Modify: `src/core/agentMemory.ts`

**Interfaces:**
- `getDb()` now also creates `agent_memories_fts` FTS5 virtual table with content mirroring
- `recall()` LIKE fallback replaced by FTS5 `MATCH` query (automatic stemming + prefix search)
- Existing `recallSemantic()` unchanged

- [ ] **Step 1: Add FTS5 setup to `getDb()` in `src/core/agentMemory.ts`**

After the existing `try { _db.exec("ALTER TABLE...") } catch {}` line, add:

```typescript
  // FTS5 virtual table for O(log n) full-text search on key+value
  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts
    USING fts5(key, value, content=agent_memories, content_rowid=rowid);
  `);
  // Triggers to keep FTS index in sync with the base table
  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS am_ai AFTER INSERT ON agent_memories BEGIN
      INSERT INTO agent_memories_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
    END;
    CREATE TRIGGER IF NOT EXISTS am_ad AFTER DELETE ON agent_memories BEGIN
      INSERT INTO agent_memories_fts(agent_memories_fts, rowid, key, value)
        VALUES ('delete', old.rowid, old.key, old.value);
    END;
    CREATE TRIGGER IF NOT EXISTS am_au AFTER UPDATE ON agent_memories BEGIN
      INSERT INTO agent_memories_fts(agent_memories_fts, rowid, key, value)
        VALUES ('delete', old.rowid, old.key, old.value);
      INSERT INTO agent_memories_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
    END;
  `);
```

- [ ] **Step 2: Replace the LIKE fallback in `recall()` with FTS5 query**

Change the LIKE block inside `recall()` from:

```typescript
    const pattern = `%${query}%`;
    const rows = db.prepare(`
      SELECT * FROM agent_memories
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY last_accessed DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as Memory[];
```

To:

```typescript
    // FTS5 MATCH — O(log n) vs full-scan LIKE; falls back to LIKE if FTS table absent
    let rows: Memory[];
    try {
      const ftsIds = db.prepare(
        "SELECT rowid FROM agent_memories_fts WHERE agent_memories_fts MATCH ? ORDER BY rank LIMIT ?"
      ).all(`${query}*`, limit) as Array<{ rowid: number }>;
      if (ftsIds.length === 0) {
        rows = [];
      } else {
        const placeholders = ftsIds.map(() => "?").join(",");
        rows = db.prepare(
          `SELECT * FROM agent_memories WHERE rowid IN (${placeholders}) ORDER BY last_accessed DESC`
        ).all(...ftsIds.map(r => r.rowid)) as Memory[];
      }
    } catch {
      // FTS not available (e.g. in-memory test DB) — degrade gracefully
      const pattern = `%${query}%`;
      rows = db.prepare(
        "SELECT * FROM agent_memories WHERE key LIKE ? OR value LIKE ? ORDER BY last_accessed DESC LIMIT ?"
      ).all(pattern, pattern, limit) as Memory[];
    }
```

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Run tests**

```
npm test -- --forceExit
```
Expected: 300 passed (FTS fallback to LIKE in test DBs keeps existing tests green).

- [ ] **Step 5: Commit**

```
git add src/core/agentMemory.ts
git commit -m "perf(memory): add FTS5 full-text search index with trigger sync; fallback to LIKE for in-memory test DBs"
```

---

## Task 4: Google Workspace Live Access Test

**Files:**
- Create: `scripts/test-google-access.ts`

**Interfaces:**
- Standalone script, no imports from MidpointX core (avoids loading full graph)
- Reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` from `.env`
- Prints a structured pass/fail table for each Google service

- [ ] **Step 1: Create `scripts/test-google-access.ts`**

```typescript
import "dotenv/config";

interface ServiceResult {
  service: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

async function getToken(): Promise<string> {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REFRESH_TOKEN: refreshToken } = process.env;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google credentials missing from .env");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  const data = await res.json() as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description ?? "Token refresh failed");
  return data.access_token;
}

async function probe(service: string, url: string, token: string): Promise<ServiceResult> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as Record<string, unknown>;
    if (res.status === 200) return { service, status: "PASS", detail: JSON.stringify(Object.keys(data)) };
    return { service, status: "FAIL", detail: `HTTP ${res.status}: ${data.error ?? JSON.stringify(data).slice(0, 80)}` };
  } catch (e: any) {
    return { service, status: "FAIL", detail: e.message };
  }
}

async function main() {
  console.log("\n=== MidpointX Google Access Verification ===\n");
  let token: string;
  try {
    token = await getToken();
    console.log("✅ OAuth2 token refresh: PASS\n");
  } catch (e: any) {
    console.error("❌ OAuth2 token refresh: FAIL —", e.message);
    process.exit(1);
  }

  const results: ServiceResult[] = await Promise.all([
    probe("Gmail (inbox)", "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&labelIds=INBOX", token),
    probe("Gmail (profile)", "https://gmail.googleapis.com/gmail/v1/users/me/profile", token),
    probe("Google Drive (root)", "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)", token),
    probe("Google Calendar", "https://www.googleapis.com/calendar/v3/calendars/primary", token),
    probe("Google Tasks", "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=1", token),
    probe("Google Docs (API)", "https://docs.googleapis.com/v1/documents/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms", token), // public sample doc
    probe("Google Sheets (API)", "https://sheets.googleapis.com/v4/spreadsheets?", token),
    probe("People API", "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses", token),
  ]);

  console.log("Service                  | Status | Detail");
  console.log("-------------------------|--------|------------------------------------------");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "SKIP" ? "⏭️" : "❌";
    console.log(`${icon} ${r.service.padEnd(24)}| ${r.status.padEnd(6)} | ${r.detail}`);
  }

  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`\n${passed}/${results.length} Google services accessible`);
  if (failed > 0) {
    console.log(`\n⚠️  ${failed} services failed — check OAuth scopes in Google Cloud Console.`);
    console.log("   Required scopes: gmail.readonly, drive.readonly, calendar.readonly, tasks.readonly, spreadsheets.readonly, documents.readonly");
  }
}

main().catch(console.error);
```

- [ ] **Step 2: Run the access test**

```
npx tsx scripts/test-google-access.ts
```

Expected: Table showing each Google service as PASS or FAIL with detail.

- [ ] **Step 3: If any services FAIL with a 403 "insufficient scope" error**

The OAuth refresh token was issued with limited scopes. Resolution:
1. Go to Google Cloud Console → OAuth 2.0 consent screen
2. Add scopes: `gmail.readonly`, `drive.readonly`, `calendar.readonly`, `tasks.readonly`, `spreadsheets.readonly`, `documents.readonly`
3. Re-authorize and update `GOOGLE_REFRESH_TOKEN` in `.env`

- [ ] **Step 4: Commit**

```
git add scripts/test-google-access.ts
git commit -m "chore(scripts): add Google Workspace live access verification script"
```

---

## Summary Checklist

- [ ] Task 1: Config schema additions (BRAVE_API_KEY, GOOGLE_MAPS_API_KEY, Google OAuth fields)
- [ ] Task 2: A2A HMAC-SHA256 delegation signing
- [ ] Task 3: FTS5 full-text search for AgentMemory
- [ ] Task 4: Google Workspace live access test
- [ ] Manual: Start Docker Desktop (`docker desktop start`) to restore sandbox isolation

**Docker note:** Docker can only be started by the user manually. Until Docker Desktop is running, the sandbox falls back to host-shell execution with a console warning — no data loss risk, just reduced isolation.
