---
name: THEOREM_FS_02
description: file management, error handling, skill integration
---

# Logic Shift: THEOREM_FS_02
Trace ID: TELEGRAM-1779814941426
Learned At: 2026-05-26T17:03:01.294Z

## Justification
The standard approach of directly attempting file operations failed because the prerequisite file did not exist. This theorem codifies a proactive check and creation step, ensuring file system operations are robust against missing prerequisite files, especially when those files are intended to mirror skill content.

## Discovered Pattern
Attempting to read from or write to a file that does not exist, and the file's content is expected to be derived from a skill.

## Optimized Approach
Before performing file operations (read/write) on a file that is expected to contain skill content, first check for the file's existence at the specified path. If the file does not exist, read the content from the corresponding skill using `system__read_skill` and then write that content to the file. This ensures the file is present and populated before subsequent operations, preventing 'file not found' errors.
