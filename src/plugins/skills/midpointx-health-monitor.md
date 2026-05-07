---
name: MIDPOINTX_HEALTH_MONITOR
description: Periodically checks the health of the MidpointX server and logs.
schedule: "0 */6 * * *"
---

# Logic Shift: MIDPOINTX_HEALTH_MONITOR

## Justification
Ensures the MidpointX framework is running within optimal parameters and hasn't encountered silent failures in background services (Telegram/Discord/Scheduler).

## Discovered Pattern
Monitoring own logs and process state to identify degradation.

## Optimized Approach
Every 6 hours, scan the `MidpointX_heartbeat.txt` and verify that the core services are responding. Log any anomalies to the memory file.

### Execution Plan
1. Check if `src/server.ts` is running (via process info if possible, or internal flag).
2. Read the last 50 lines of `MidpointX.log` (if it exists).
3. Post a health summary to the console and Telegram.
