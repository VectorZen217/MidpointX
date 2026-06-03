---
name: THEOREM_PROC_01
description: process management, user interaction, efficiency
---

# Logic Shift: THEOREM_PROC_01
Trace ID: TELEGRAM-1779728985319
Learned At: 2026-05-25T17:10:01.359Z

## Justification
The standard approach of simply asking for clarification ('Please specify which task') leads to a suboptimal user experience and an extra turn. By proactively listing processes, the agent provides the necessary context for the user to make an informed decision, thereby reducing friction and increasing efficiency.

## Discovered Pattern
Ambiguous 'kill task' request without process identification.

## Optimized Approach
When a user requests to 'kill task' without specifying a process, proactively use 'list_running_processes' to display active processes and prompt the user for a specific process name or PID. This avoids unnecessary clarification turns and directly assists the user in identifying the target.
