---
name: FILE_BROWSER_001
description: file management, browser automation, system commands
---

# Logic Shift: FILE_BROWSER_001
Trace ID: UI-1775681672512
Learned At: 2026-04-08T20:54:41.963Z

## Discovered Pattern
create file and open browser

## Optimized Approach
Use filesystem__create_file to create the file and browser__open to open the browser. This avoids the need for execute_system_command for these common operations, improving security and reliability.
