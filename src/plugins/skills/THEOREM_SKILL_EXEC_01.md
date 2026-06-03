---
name: THEOREM_SKILL_EXEC_01
description: skill execution, direct invocation, task optimization
---

# Logic Shift: THEOREM_SKILL_EXEC_01
Trace ID: PROACTIVE_MIDPOINTX_HEALTH_MONITOR-1779577200032
Learned At: 2026-05-23T23:00:09.640Z

## Justification
The standard approach of retrieving and then executing the skill is sound. However, the explicit naming of the skill in the task description indicates a direct intent that bypasses the need for a broader replanning step as a default fallback. This theorem streamlines the process by directly invoking the specified skill, assuming its availability, which is a reasonable assumption given the explicit instruction. Replanning should be reserved for situations where the skill cannot be found or fails critically.

## Discovered Pattern
Executing a specific skill when the task explicitly names it and provides context.

## Optimized Approach
Directly load the named skill using `system__read_skill` with its exact name (hyphens, no underscores, no suffixes). After reading, follow the skill's text instructions directly as written — skills are instruction documents, NOT callable tools. There is no "execution function" to call; the skill content IS the procedure. Avoid intermediate replanning steps unless skill retrieval fails.
