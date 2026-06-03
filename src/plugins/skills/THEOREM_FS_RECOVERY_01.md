---
name: THEOREM_FS_RECOVERY_01
description: Prevents path hallucination when accessing internal agent skills.
category: error-recovery
---

# Logic Shift: THEOREM_FS_RECOVERY_01

## Justification
Proactive triggers often cause the agent to attempt self-referential skill reads. Using generic filesystem tools leads to path hallucination (e.g., guessing `skills/` instead of `src/plugins/skills/`).

## Discovered Pattern
The `PluginRegistry` handles internal mapping of skill names to absolute paths. Generic `filesystem__read_text_file` calls ignore this mapping and rely on LLM path guessing, which is fragile.

## Optimized Approach
1. **NEVER** use `filesystem__read_text_file` to read a file that is registered as a Skill.
2. **ALWAYS** use `system__read_skill` with the skill's internal name (e.g., `MIDPOINTX_HEALTH_MONITOR`).
3. If a tool fails with `ENOENT` on a path containing the word "skill", immediately pivot to `system__read_skill`.

### Verification Plan
- [ ] Run a test mission: "Read the content of the MIDPOINTX_HEALTH_MONITOR skill using system__read_skill."
- [ ] Verify that no `filesystem` tools are called during this mission.
