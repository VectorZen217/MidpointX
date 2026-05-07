---
name: THEOREM_DEBUG_01
description: debugging, code-analysis, systematic-triage
---

# Logic Shift: THEOREM_DEBUG_01
Trace ID: UI-1776108446718
Learned At: 2026-04-13T19:28:53.936Z

## Discovered Pattern
A user reports a functional failure in a software application (e.g., 'X fails to do Y'), and the full codebase is available for inspection.

## Optimized Approach
Employ a systematic, top-down triage approach. First, read documentation to establish the ground truth of expected behavior. Second, map the codebase structure (e.g., directory tree) to identify key components. Third, review configuration files, as they are common and easily-fixed points of failure. Fourth, trace the main execution flow. Finally, with full context, inspect specific logic modules and runtime logs for errors. This 'context-first' methodology is more efficient than immediately jumping into code or logs without a structural understanding.
