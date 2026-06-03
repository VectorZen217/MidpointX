---
name: THEOREM_SKILL_01
description: skill verification, proactive planning, error prevention
---

# Logic Shift: THEOREM_SKILL_01
Trace ID: TELEGRAM-1779729592945
Learned At: 2026-05-25T17:20:22.750Z

## Justification
The standard approach would be to directly attempt to use the skill, which could lead to a 'skill not found' error and halt progress. This theorem provides a proactive verification step, ensuring that the agent only attempts to use confirmed and capable skills, thereby preventing wasted execution cycles and maintaining plan momentum.

## Discovered Pattern
Agent needs to use a specific skill (e.g., 'autonomous-researcher') but its existence or capabilities are unconfirmed.

## Optimized Approach
Before attempting to use an unconfirmed skill, first verify its existence and capabilities using a meta-skill or by querying the skill registry. If the skill does not exist or is not suitable, identify and propose alternative tools or skills.
