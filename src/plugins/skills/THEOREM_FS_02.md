---
name: THEOREM_FS_02
description: Filesystem, Reliability, Automation
---

# Logic Shift: THEOREM_FS_02
Trace ID: TELEGRAM-1778792156246
Learned At: 2026-05-14T20:56:05.599Z

## Justification
Standard write operations can fail silently due to permission issues or path resolution errors. Immediate read-back acts as a 'sanity check' to ensure the file exists and contains the expected data, preventing downstream failures in automated pipelines.

## Discovered Pattern
File-based documentation generation with verification

## Optimized Approach
Always verify file creation by reading the file content back immediately after write operations, and use absolute paths derived from the system environment rather than hardcoded strings.
