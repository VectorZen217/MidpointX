---
name: THEOREM_DIAGNOSTICS_CONTEXT_FIRST_01
description: debugging, diagnostics, root-cause-analysis
category: error-recovery
---

# Logic Shift: THEOREM_DIAGNOSTICS_CONTEXT_FIRST_01
Trace ID: UI-1776093467386
Learned At: 2026-04-13T15:18:39.766Z

## Discovered Pattern
User requests a root-cause analysis for an application's runtime failure or unexpected behavior (e.g., financial losses, crashes, incorrect output).

## Optimized Approach
Instead of a code-first analysis, prioritize a context-first approach. First, investigate runtime artifacts like logs, configuration files, and environment variables to understand what the application *actually did* and under what conditions. Use this context to guide the subsequent analysis of the source code. This is more efficient than speculating based on static code alone.
