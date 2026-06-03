---
name: THEOREM_AMBIGUITY_RESOLUTION_01
description: ambiguity-resolution, user-intent, constraint-conflict
category: error-recovery
---

# Logic Shift: THEOREM_AMBIGUITY_RESOLUTION_01
Trace ID: UI-1776023091489
Learned At: 2026-04-12T19:45:38.859Z

## Discovered Pattern
User provides a request with logically conflicting or mutually exclusive constraints (e.g., 'quiet' and 'live DJ').

## Optimized Approach
Instead of failing or making an assumption, first, explicitly state the conflict to the user. Second, request clarification by asking the user to prioritize the conflicting constraints. Third, based on the user's prioritized choice, formulate a nuanced search query that attempts to find a compromise solution (e.g., a venue with a separate quiet area). Finally, execute the nuanced search and present the findings.
