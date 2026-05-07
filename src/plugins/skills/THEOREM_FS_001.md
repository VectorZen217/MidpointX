---
name: THEOREM_FS_001
description: filesystem, precondition, verification
---

# Logic Shift: THEOREM_FS_001
Trace ID: UI-1775844676138
Learned At: 2026-04-10T18:11:48.838Z

## Discovered Pattern
A file modification task is dependent on the existence of another file.

## Optimized Approach
Before executing the file modification, first verify the existence of the dependent file. If the verification fails, abort the operation to prevent creating a broken state. Use conditional logic within the execution command to handle both success and failure cases.
