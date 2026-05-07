---
name: self-improvement
description: Analyzes performance signals to propose surgical updates to skills.
---

# Self-Improvement Skill

This skill enables the agent to learn from its own successes and failures.

## Core Workflow
1. **Log Signal:** After a task, if a learning or error occurred:
   - Use `read_file` on `.memory/SIGNALS.json`.
   - Append a new signal entry (Schema: Spec 2.1).
   - Sanitize content: `python scripts/sanitize_signals.py "<content>"`.
   - Write back: `write_file` to `.memory/SIGNALS.json`.
   - Sync to Markdown: Append to `.memory/LEARNINGS.md` or `ERRORS.md`.
2. **Validate:** Run `python scripts/validate_signals.py .memory/SIGNALS.json`.
3. **Analyze:** Run `python scripts/analyze_signals.py .memory/SIGNALS.json`.
4. **Propose:** Present the surgical `replace` diff to the user.
5. **Apply:** Only if the user says "Approved."

## Signal Schema
```json
{
  "id": "SIG-YYYYMMDD-XXX",
  "timestamp": "ISO-8601",
  "session_id": "unique-id",
  "original_task": "The user prompt",
  "skill": "skill-name",
  "outcome": "success | failure | correction",
  "category": "api | logic | setup | styling",
  "summary": "Short description of the event",
  "root_cause": "Detailed explanation for failures",
  "fix_applied": "The manual fix that worked",
  "proposed_skill_update": "A concise instruction to add to SKILL.md",
  "status": "pending | applied | rejected"
}
```
