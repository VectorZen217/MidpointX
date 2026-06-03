---
name: THEOREM_DOCKER_SANDBOX_01
description: Defines tiered execution fallback when Docker is unavailable. Ensures code execution never silently runs outside the intended security boundary.
conceptualTags: [sandbox, docker, security]
---

# Logic Shift: THEOREM_DOCKER_SANDBOX_01
Trace ID: MANUAL-ROBUSTNESS-03
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The `sandboxManager.ts` calls `isDockerAvailable()` and silently falls back to unsandboxed execution when Docker is not running. This is a silent security boundary degradation — code that was expected to run in a hardened container (`--network=none`, `--cap-drop=ALL`) runs instead in the host process with full network and filesystem access. The agent and user both need to know when this happens, and the decision to proceed must be explicit.

## Discovered Pattern
Any call to `runInSandbox()` when Docker is unavailable either throws or silently degrades. Neither outcome is auditable or user-visible without this skill.

## Tiered Execution Model

### Tier 1 — Full Sandbox (default, preferred)
**Condition:** Docker is available and `USE_DOCKER_SANDBOX=true`
**Execution:** `runInSandbox()` with `--network=none --cap-drop=ALL --memory=512m --cpus=0.5`
**Audit:** Log tier as `SANDBOX_TIER_1` in the A2A audit ledger entry.

### Tier 2 — Restricted Local Subprocess (degraded, audited)
**Condition:** Docker is unavailable AND the code to execute is read-only/analytical (no file writes, no network calls, no process spawning)
**Execution:** Spawn a child process via Node.js `child_process.execFile` with a 10-second hard timeout. Use `uid`/`gid` drop on Linux if available.
**Requirement:** MUST notify the user: `"⚠️ Docker unavailable. Running in restricted local subprocess (Tier 2). Network and filesystem writes are blocked by policy."`
**Audit:** Log tier as `SANDBOX_TIER_2_DEGRADED`.

### Tier 3 — Deny (safe default for destructive operations)
**Condition:** Docker is unavailable AND the code involves file writes, network calls, process spawning, or any operation that PolicyEngine would classify as requiring a sandbox
**Execution:** Do NOT execute. Set `needsApproval = true`, route to `HumanApprovalGate`.
**Message:** `"🛑 Execution blocked: Docker sandbox unavailable and operation requires isolation. Manual approval required to proceed without sandbox."`
**Audit:** Log tier as `SANDBOX_TIER_3_DENIED`.

## Standard Operating Procedure

1. Before any `runInSandbox()` call, check `isDockerAvailable()`.
2. If `true` → Tier 1. Proceed normally.
3. If `false`:
   a. Classify the pending code: does it write files, touch the network, or spawn processes?
   b. If analytical only → Tier 2. Notify user. Execute with timeout.
   c. If potentially destructive → Tier 3. Block and escalate.
4. Always write the chosen tier to the audit ledger before execution.
5. After recovery (Docker becomes available again), log `SANDBOX_RESTORED` and resume Tier 1 for subsequent tasks.

## Docker Recovery Check
If `SANDBOX_AUTONOMOUS_MODE=true`, attempt `docker info` once every 60 seconds during a Tier 2 or Tier 3 hold. When Docker comes back online, automatically resume from the blocked step without user intervention.
