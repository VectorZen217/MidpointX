---
name: strategic-planner
description: Implements a Plan-and-Execute architecture for complex, multi-step tasks. Use when a task requires more than 3 distinct operations or has high ambiguity.
---

# Strategic Planner

This skill enables a structured approach to complex tasks by separating planning from execution and providing a robust self-correction loop.

## Core Workflow

1. **Analysis & Deconstruction**:
    - Analyze the user request for implicit dependencies.
    - Identify required tools (GitHub, Workspace, Shell, etc.).
    - Break the task into discrete, atomic steps.
2. **Plan Generation**:
    - Use `assets/execution-plan-template.md` to create a `PLAN.md` in the project root.
    - **Crucial**: Each step must have a clear "Success Criterion" (e.g., "Test suite passes", "File exists with content X").
3. **Sequential Execution**:
    - Execute steps one by one.
    - **Verification**: After each step, verify the success criterion. Do not proceed if it fails.
4. **Autonomous Re-planning**:
    - If a step fails, investigate the cause (e.g., read error logs, check file state).
    - Modify the `PLAN.md` to include a fix or a pivot.
    - **Only** ask the user if the pivot significantly changes the project scope.
5. **Final Validation**:
    - Once all steps are complete, run a global verification (e.g., build project, run all tests).
    - Delete the `PLAN.md` (or archive it to `docs/plans/`) upon successful completion.

## Guidelines

- **Predictability**: The user should always be able to see the `PLAN.md` to know exactly what is happening.
- **Resilience**: Treat errors as "information" for re-planning, not as roadblocks.
- **Tool-Awareness**: Actively audit the environment before planning to ensure all necessary tools/libraries are available.

## Reflect & Learn
- [ ] **Reflect & Learn**: Log task outcome to .memory/ using the self-improvement signal schema.
