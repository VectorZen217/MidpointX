---
name: THEOREM_APPROVAL_ESCALATION_01
description: Defines what happens when the HumanApprovalGate receives no response within a timeout window. Prevents the agent from hanging indefinitely on an unattended approval request.
conceptualTags: [human-in-the-loop, approval, escalation]
---

# Logic Shift: THEOREM_APPROVAL_ESCALATION_01
Trace ID: MANUAL-ROBUSTNESS-07
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The HumanApprovalGate pauses the graph and waits for `approvalStatus` to be set to `"approved"` or `"denied"` by the user. If the user is away (Telegram offline, desktop locked), the graph hangs indefinitely — the session will eventually hit MAX_STEPS or the 30-minute TTL and crash, losing all progress. A tiered escalation protocol ensures the agent responds gracefully regardless of user availability.

## Discovered Pattern
`approvalStatus === "pending"` with `needsApproval === true` for more than N minutes while the graph is paused at `HumanApprovalGate`.

## Escalation Tiers

### Tier 1 — Initial Notification (0 minutes)
When the approval gate is first triggered:
1. Send the approval request on ALL active channels simultaneously (Telegram, Discord, Socket.io dashboard).
2. Message format: `"⏸️ MidpointX requires approval to proceed.\nAction: [pendingAction.tool]\nArgs: [pendingAction.args]\nSeverity: [approvalSeverity]\nReply APPROVE or DENY."`
3. Start the escalation timer.

### Tier 2 — First Reminder (5 minutes elapsed)
1. Re-send the notification on all channels with: `"🔔 Reminder: Approval pending for [pendingAction.tool]. Auto-deny in 10 minutes if no response."`

### Tier 3 — Second Reminder (10 minutes elapsed)
1. Re-send with: `"⚠️ Final warning: Approval will be auto-denied in 5 minutes."`

### Tier 4 — Auto-Deny (15 minutes elapsed)
For `approvalSeverity === 'destructive'`:
1. Set `approvalStatus = "denied"`.
2. Set `isTaskComplete = false`.
3. Set `failureThesis = "APPROVAL_TIMEOUT: Action auto-denied after 15 minutes without user response."`.
4. Route to SupervisorActor for graceful abandonment of the blocking step.
5. Notify user: `"🛑 Action auto-denied due to timeout. Task paused. Resume when ready."`

For `approvalSeverity === 'undoable'`:
1. Auto-approve after 15 minutes (undoable actions are reversible by definition).
2. Log: `"AUTO_APPROVED: Undoable action proceeded after 15-minute timeout."`
3. Continue execution normally.

### Tier 5 — Session Preservation (30 minutes elapsed, no response to any channel)
1. Write the full pending state to persistence: `appendLog("approval_hold", taskId, JSON.stringify(pendingAction))`.
2. Terminate the session with status `TIMEOUT`.
3. On next session start, detect the `approval_hold` log and restore the pending action for the user to decide.

## Channel Priority
Escalation messages should be sent in this order of reliability:
1. Telegram (highest persistence — message history survives app restart)
2. Discord
3. Socket.io dashboard (ephemeral — only if browser tab is open)
