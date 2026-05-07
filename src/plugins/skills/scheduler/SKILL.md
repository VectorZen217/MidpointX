---
name: scheduler
description: Schedule and manage recurring tasks on Windows using the Task Scheduler. Use when the user needs to run scripts, commands, or applications at specific times or intervals (daily, weekly, etc.).
---

# Scheduler

This skill provides a programmatic way to manage Windows Task Scheduler tasks.

## Workflows

### 1. Create a Scheduled Task
To schedule a new task, use the `scripts/task_manager.js` script.

**Usage:**
`node scripts/task_manager.js create <name> <command> [schedule] [start_time]`

- `name`: Unique name for the task.
- `command`: The full path to the executable or script to run.
- `schedule`: `MINUTE`, `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`.
- `start_time`: `HH:mm` format (e.g., `14:30`).

### 2. List Tasks
View all scheduled tasks or details for a specific one.

**Usage:**
`node scripts/task_manager.js list [name]`

### 3. Delete a Task
Remove a task from the scheduler.

**Usage:**
`node scripts/task_manager.js delete <name>`

### 4. Run Task Now
Manually trigger a scheduled task immediately.

**Usage:**
`node scripts/task_manager.js run <name>`

## Important Notes
- **Paths:** Always use absolute paths for the command to ensure the Task Scheduler can find the executable.
- **Permissions:** Tasks are created with the current user's permissions.
- **Windows Only:** This skill specifically uses `schtasks.exe` and is designed for `win32` environments.
## Reflect & Learn
- [ ] **Reflect & Learn**: Log task outcome to .memory/ using the self-improvement signal schema.
