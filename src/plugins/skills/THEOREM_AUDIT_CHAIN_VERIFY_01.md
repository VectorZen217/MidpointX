---
name: THEOREM_AUDIT_CHAIN_VERIFY_01
description: Proactive scheduled audit that walks the A2A hash chain and detects tampering. Turns the write-only audit ledger into an active tamper-detection system.
schedule: "0 2 * * *"
conceptualTags: [security, audit, integrity]
---

# Logic Shift: THEOREM_AUDIT_CHAIN_VERIFY_01
Trace ID: MANUAL-ROBUSTNESS-11
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The A2A protocol writes a hash-chained audit ledger on every node commit — an excellent tamper-evidence structure. But a chain is only useful if it is verified. Currently the ledger is append-only and never read back for integrity checks. If an entry were modified (by a rogue process, filesystem corruption, or a malicious edit), the agent would have no way to detect it. This skill runs nightly to validate the entire chain and alert on any break.

## Mission
Every night at 2:00 AM, verify the integrity of the A2A audit ledger for all active and recently completed sessions. Alert immediately on any chain break.

## Execution Plan

### Step 1 — Load the Audit Ledger
1. Read all audit entries: `PersistenceFactory.getAdapter().readLogs("audit", "ledger")` (or iterate all files in the audit category).
2. Parse each entry as JSON: `{ timestamp, node, commit, previousHash, hash }`.
3. Sort entries by timestamp ascending.

### Step 2 — Walk the Chain
For each entry at index `i > 0`:
1. Reconstruct the expected hash:
   ```
   expectedHash = sha256(JSON.stringify({
     timestamp: entries[i].timestamp,
     node: entries[i].node,
     commit: entries[i].commit,
     previousHash: entries[i-1].hash
   }))
   ```
2. Compare `expectedHash` to `entries[i].hash`.
3. If they differ: record a `CHAIN_BREAK` at entry `i`.

### Step 3 — Report Results

**If no breaks found:**
- Write to heartbeat file: `"Audit chain VALID. [N] entries verified. [timestamp]"`
- Log to diagnostics: `AUDIT_VERIFY_OK`

**If breaks found:**
- Immediately notify the user on all active channels: `"🔴 SECURITY ALERT: Audit chain integrity failure detected. [N] break(s) found at entries: [indices]. Possible tampering or filesystem corruption. Immediate review required."`
- Write a full break report to: `src/workspace/security/audit_breach_[timestamp].md`
- Include: break location, expected hash, actual hash, and the content of the modified entry.
- Set a persistent `AUDIT_INTEGRITY_COMPROMISED` flag in stats so the agent surfaces this on every subsequent startup until resolved.

### Step 4 — Chain Statistics
Regardless of break status, write summary stats:
- Total entries verified
- Date range covered
- Sessions included
- Last valid hash

## Recovery After a Detected Break
Do NOT attempt to auto-repair the chain. Tampering investigation requires human judgment. The agent's role is to:
1. Quarantine the compromised session's data (move to `src/workspace/quarantine/`).
2. Refuse to use any execution result from a session with a broken chain as evidence for future planning.
3. Await explicit human instruction before resuming affected workflows.
