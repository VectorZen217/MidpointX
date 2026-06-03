---
name: THEOREM_SECRET_ROTATION_01
description: Connects the resilience layer's 401/403 abort signals to a structured API key rotation and recovery workflow. Prevents the agent from silently failing on expired credentials.
conceptualTags: [security, credentials, resilience]
---

# Logic Shift: THEOREM_SECRET_ROTATION_01
Trace ID: MANUAL-ROBUSTNESS-12
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The resilience wrapper (THEOREM_ERROR_TAXONOMY_01 Class C) hard-aborts on HTTP 401 and 403, correctly refusing to retry invalid credentials. But after the abort, the agent has no workflow to: (a) identify which key failed, (b) check if a backup key is available, (c) notify the user with actionable guidance, or (d) resume the task after rotation. Without this workflow, a single expired API key silently kills the entire mission with no recovery path.

## Discovered Pattern
`AbortError` with `Deterministic failure (HTTP 401)` is thrown by `invokeWithResilience`. The error surfaces in ExecutionActor's catch block but the key that failed is not identified, no notification is sent, and the task terminates without a recovery prompt.

## Rotation Workflow

### Step 1 — Identify the Failing Credential
When a Class C (PERMISSION) error is detected in ExecutionActor:
1. Extract the tool name from the current action: `pendingAction.tool`.
2. Map the tool to its credential source using the lookup table below.
3. Log: `"CREDENTIAL_FAILURE: [tool] → [credential_key] returned HTTP [status]"`

**Credential Map:**
| Tool prefix | Config key | Provider |
|---|---|---|
| `anthropic`, `llm` | `ANTHROPIC_API_KEY` | Anthropic Console |
| `openai` | `OPENAI_API_KEY` | OpenAI Platform |
| `google`, `gemini`, `google-workspace` | `GEMINI_API_KEY` | Google AI Studio |
| `github`, `mcp_GitKraken` | `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub Settings |
| `telegram` | `TELEGRAM_BOT_TOKEN` | BotFather |
| `discord` | `DISCORD_BOT_TOKEN` | Discord Dev Portal |
| `nvidia` | `NVIDIA_API_KEY` | NVIDIA NIM |

### Step 2 — Check for Backup Provider
1. If the failing key is the primary LLM (`ANTHROPIC_API_KEY` or `ACTIVE_LLM_PROVIDER`):
   - Check `Config.OPENAI_API_KEY` and `Config.GEMINI_API_KEY` availability.
   - If a backup is available: switch `ACTIVE_LLM_PROVIDER` temporarily via `reloadConfig()` and retry the failed step.
   - Log: `"FAILOVER: Switched LLM provider from [old] to [new] due to credential failure."`
2. For non-LLM tools: no automatic failover. Proceed to Step 3.

### Step 3 — User Notification
Send an immediate notification on all active channels:
```
🔑 Credential Rotation Required
Tool:     [tool name]
Key:      [Config key name] (redacted — never log the actual key value)
Reason:   HTTP [status] — key may be expired, revoked, or quota-exhausted
Action:   Update [Config key name] in .env and restart the backend.
Task:     "[userIntent]" is paused pending credential update.
```

### Step 4 — Preserve Task State
1. Write the full current `strategicPlan` and `actionHistory` to persistence:
   `appendLog("credential_hold", taskId, JSON.stringify({ strategicPlan, replanCount, failureThesis }))`
2. Set session status to `FAILED` with reason `CREDENTIAL_FAILURE`.
3. On next session start, detect the `credential_hold` log and offer to resume: `"A previous task was paused due to a credential failure. Resume now?"`

## Proactive Expiry Detection (Scheduled)
Run weekly via Observer cron `0 9 * * 1` (Monday 9 AM):
1. Make a lightweight test call to each configured provider (e.g., list models endpoint).
2. A 401 response indicates the key is invalid NOW — notify the user before it blocks a live task.
3. A successful response logs: `"KEY_HEALTH: [provider] key valid as of [timestamp]."`
4. Write the health status to `src/workspace/diagnostics/key_health.json`.

## Security Constraints
- NEVER log, store, or transmit the actual value of any API key.
- NEVER include key values in audit ledger entries.
- NEVER suggest the user paste a key value into a chat message — always direct them to update `.env` directly.
