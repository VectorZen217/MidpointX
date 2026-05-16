---
name: PROACTIVE_HEARTBEAT
description: System health check and heartbeat.
schedule: "0 */12 * * *"
---

# Logic Shift: PROACTIVE_HEARTBEAT

## Justification
This skill serves as a persistent heartbeat to verify the proactive scheduling system is operational. It ensures the agent can wake up autonomously and interact with the environment.

## Discovered Pattern
Performing a periodic health check by writing a status file to a known location.

## Optimized Approach
Every 12 hours, write a file named 'MidpointX_heartbeat.txt' to the user's desktop containing the current timestamp and a message confirming the proactive heartbeat is healthy.

### Execution Plan
1. Use `filesystem__write_text_file` to write to `C:/Users/randy/Desktop/MidpointX_heartbeat.txt`.
2. Content: "MidpointX Heartbeat Active. Proactive Autonomy confirmed. Time: [CURRENT_TIME]"
