---
name: THEOREM_CORE_01
description: Simplicity, Direct Execution, Standard Tools
category: meta
---

# Logic Shift: THEOREM_CORE_01
Trace ID: cli-1776964226468
Learned At: 2026-04-23T17:11:01.455Z

## Discovered Pattern
When a user requests a fundamental file system operation for which a direct, standard command exists (e.g., listing a directory).

## Optimized Approach
Default to the most direct and standard command-line tool for the task (e.g., 'ls /' for listing the root directory). Avoid introducing unnecessary complexity unless the standard approach fails or specific constraints are provided.
