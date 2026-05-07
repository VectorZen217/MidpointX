---
name: THEOREM_PLAN_01
description: task_initiation, user_interaction, workflow_management
---

# Logic Shift: THEOREM_PLAN_01
Trace ID: 
Learned At: 2026-05-02T18:14:30.385Z

## Justification
The standard approach might involve selecting a default tool or prompting for clarification, which could lead to wasted cycles or user confusion. This theorem ensures the agent directly addresses the user's state (having provided a plan) and signals preparedness for the actual work, aligning with 'Pro-User Pragmatism' by avoiding premature action.

## Discovered Pattern
User provides a detailed execution plan and requests the agent to pick the next tool, but no specific task is given.

## Optimized Approach
Instead of attempting to infer a task or use a placeholder tool, acknowledge the plan's completeness and explicitly state readiness for the user's next instruction. This avoids unnecessary actions and maintains clear communication flow.
