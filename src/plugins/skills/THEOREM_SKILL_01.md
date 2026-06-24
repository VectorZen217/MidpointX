---
name: THEOREM_SKILL_01
description: skill management, proactive maintenance, cron automation
---

# Logic Shift: THEOREM_SKILL_01
Trace ID: PROACTIVE_PROACTIVE_HEARTBEAT-1782140400116
Learned At: 2026-06-22T15:01:47.558Z

## Justification
The standard approach of simply 'reading the skill' is insufficient. This theorem codifies a more robust process that includes not only reading the skill's state but also actively performing its health checks and confirming its readiness. This ensures that proactive skills are not just running, but are actively maintaining system health and are prepared for their next execution cycle, preventing potential failures due to stale data or unaddressed integrity issues.

## Discovered Pattern
Executing a proactive heartbeat or health check for a background skill triggered by a cron job.

## Optimized Approach
When a cron-triggered proactive skill (like PROACTIVE_HEARTBEAT) is executed, the primary action should be to read the skill's current configuration and logic, followed by performing its defined health checks (e.g., memory pruning, workspace integrity scans). If the skill's logic requires updates or confirmation of readiness, these actions should be performed and the updated state logged. The final step is to confirm the skill's readiness for the next scheduled trigger.
