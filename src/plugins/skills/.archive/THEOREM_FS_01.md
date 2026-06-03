---
name: THEOREM_FS_01
description: filesystem, directory creation, robustness
---

# Logic Shift: THEOREM_FS_01
Trace ID: TELEGRAM-1779729703004
Learned At: 2026-05-25T17:21:55.238Z

## Justification
The standard approach of directly creating the final directory (e.g., `New-Item -ItemType Directory -Path 'D:\temp\build'`) can fail if the parent directory ('D:\temp' in this example) does not exist. This theorem ensures robustness by creating the necessary parent directories first, preventing unexpected failures.

## Discovered Pattern
User requests to build artifacts in a specific directory, e.g., 'build it in D:\temp\build'

## Optimized Approach
When a user requests a build location, ensure the parent directory exists first, then create the target build directory. For example, if the request is 'build in D:\temp\build', first check/create 'D:\temp', then create 'D:\temp\build'. This prevents errors if the parent directory is missing.
