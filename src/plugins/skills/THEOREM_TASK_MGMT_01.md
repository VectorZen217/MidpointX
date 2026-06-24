---
name: THEOREM_TASK_MGMT_01
description: task management, user interaction, process identification
---

# Logic Shift: THEOREM_TASK_MGMT_01
Trace ID: TELEGRAM-1781895597871
Learned At: 2026-06-19T19:00:08.339Z

## Justification
The standard approach of simply asking for clarification ('Please specify which task you wish to cancel') is inefficient. It requires an additional turn from the user to identify the task, which they may not be able to do easily if they are unaware of running processes or sub-task identifiers. Proactively providing a list of potential tasks reduces user cognitive load and speeds up the cancellation process.

## Discovered Pattern
User requests to 'cancel task' without specifying which task.

## Optimized Approach
When a user requests to cancel a task without specifying which one, the agent should proactively list currently running shell processes (using 'Get-Process' in PowerShell) and any active agent sub-tasks (if such a mechanism for tracking exists and is accessible). The agent should then present this list to the user and prompt them to select the specific task to cancel.
