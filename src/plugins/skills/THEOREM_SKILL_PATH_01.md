---
name: THEOREM_SKILL_PATH_01
description: skill management, robustness, api usage
---

# Logic Shift: THEOREM_SKILL_PATH_01
Trace ID: PROACTIVE_THEOREM_AUDIT_CHAIN_VERIFY_01-1782025200044
Learned At: 2026-06-21T07:00:33.761Z

## Justification
Directly accessing skill files via filesystem paths is brittle and prone to failure if the directory structure changes or if the skill is not located at the expected path. The `system__read_skill` function is the designated and robust method for accessing skill definitions, abstracting away the underlying file system details and ensuring reliable retrieval.

## Discovered Pattern
Attempting to read a skill file directly from the filesystem using a hardcoded or inferred path when the path is not guaranteed to be correct.

## Optimized Approach
Always use `system__list_skills` to discover available skills and their associated metadata, then use `system__read_skill` with the correct skill identifier to retrieve the skill definition. This ensures that the agent always accesses skills through the established API, which handles path resolution and skill discovery.
