---
name: PROACTIVE_HEARTBEAT
description: Periodic proactive heartbeat — triggers self-health checks, memory pruning, and workspace integrity scans on a cron schedule to keep the agent in a healthy operational state.
category: sentinel
schedule: "0 * * * *"
---

# Logic Shift: PROACTIVE_HEARTBEAT

## When to Use
- When the proactive observer fires a cron trigger with skill type `PROACTIVE_HEARTBEAT`
- Every hour to verify system health, prune stale memories, and log operational status

## Procedure
1. Run a lightweight system health check (Node version, disk space, SQLite reachability)
2. Recall the last 5 agent memories and verify the DB is readable
3. Check that the checkpoints DB is present and not corrupted
4. Log a structured heartbeat entry to `src/workspace/audit/`
5. If any check fails, emit a NOTIFY assessment so the user is informed

## Example Trigger
```json
{ "type": "cron", "skill": "PROACTIVE_HEARTBEAT", "data": {} }
```

## Common Pitfalls
- Do not launch heavy LLM tasks during heartbeat — keep it lightweight and non-blocking
- If Docker is unavailable, log a warning but do not fail the heartbeat
