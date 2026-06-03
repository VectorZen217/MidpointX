---
name: THEOREM_APPROVAL_SEVERITY_01
description: Defines the classification criteria for approvalSeverity — which actions are 'undoable' vs 'destructive' — and the corresponding UX and audit requirements for each class.
category: orchestration
conceptualTags: [human-in-the-loop, approval, security]
---

# Logic Shift: THEOREM_APPROVAL_SEVERITY_01
Trace ID: MANUAL-ROBUSTNESS-08
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The state field `approvalSeverity: 'undoable' | 'destructive'` exists but no skill defines what makes an action fall into each category. Without this classification, all approvals are treated identically — creating alert fatigue for low-risk actions (auto-approvable) and under-emphasizing genuinely irreversible operations (need explicit confirmation). Clear criteria make approvals meaningful and the UX friction proportionate to actual risk.

## Classification Criteria

### UNDOABLE — low friction approval
An action is `undoable` if ALL of the following are true:
- The operation can be reversed without data loss within 24 hours
- No external system (email sent, API POST, git push) is permanently modified
- The operation is scoped to the local filesystem or a staging environment

**Examples of UNDOABLE actions:**
- Writing or modifying a file in `D:\MidpointX\` (can be reverted via git)
- Creating a calendar event draft (not yet sent)
- Writing a Gmail draft (not yet sent)
- Installing a local npm package (reversible with `npm uninstall`)
- Creating a new branch in git

**UX for UNDOABLE:** Single-tap confirmation. Auto-approved after 15-minute timeout (see THEOREM_APPROVAL_ESCALATION_01). Message: `"▶️ Proceeding with undoable action: [description]. Reply DENY to cancel."`

### DESTRUCTIVE — high friction approval
An action is `destructive` if ANY of the following is true:
- The operation cannot be reversed (or reversal requires significant effort)
- An external system is permanently modified (email sent, payment processed, git push to main)
- Files outside `D:\MidpointX\` are modified or deleted
- Any action involving real money, credentials, or sensitive personal data
- Running code that PolicyEngine would flag if it were a shell command

**Examples of DESTRUCTIVE actions:**
- Sending an email or message (irreversible once delivered)
- Git push to `main` or a production branch
- Deleting any file (even if it appears recoverable)
- API calls that write to production systems (Stripe, Twilio, AWS)
- Executing compiled code for the first time in a non-sandbox environment
- Modifying `.env` or any secrets file

**UX for DESTRUCTIVE:** Explicit typed acknowledgment required. Message: `"🔴 DESTRUCTIVE ACTION REQUIRES EXPLICIT APPROVAL\nAction: [tool]\nArgs: [args]\nThis cannot be undone. Reply with exactly: CONFIRM [taskId] to proceed, or DENY to cancel."` Auto-denied after 15-minute timeout.

## Escalation to PolicyEngine
Before setting `approvalSeverity`, always run `PolicyEngine.evaluateAction(tool, args)`. If PolicyEngine returns a violation string, do NOT proceed to the approval gate — block immediately (no approval can override a hard policy violation).

## Audit Requirement
Every approval request — regardless of severity — must be written to the A2A audit ledger via `A2AProtocol.commit("HumanApprovalGate", { pendingAction, approvalSeverity, approvalStatus })` at the moment the gate is triggered AND at the moment the decision is recorded.
