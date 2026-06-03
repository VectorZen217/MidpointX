---
name: THEO_CODE_REVIEW_01
description: code-analysis, optimization, skill-selection
category: error-recovery
---

# Logic Shift: THEO_CODE_REVIEW_01
Trace ID: TELEGRAM-1780074889757
Learned At: 2026-05-29T17:15:13.202Z

## Justification
The standard approach of loading a broad set of 'analysis' skills is inefficient. By first analyzing the directory structure and identifying key file types (Python scripts, configuration files, strategy modules), we can more precisely select and load only the necessary skills for a targeted code review. This reduces cognitive load and improves the speed and relevance of suggestions.

## Discovered Pattern
Codebase directory listing and initial assessment for improvement suggestions.

## Optimized Approach
When presented with a codebase directory structure, prioritize identifying core logic files (e.g., strategy implementations, engine components, data processing) and configuration files. Then, load specific skills relevant to code analysis (e.g., static analysis, performance profiling, security scanning) based on the identified file types and project context. This avoids loading generic skills and focuses on targeted analysis.
