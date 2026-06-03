---
name: THEOREM_FS_MASTER
description: Consolidated filesystem operation patterns — directory creation, safe file access, atomic writes, single-command creation, recovery, and documentation setup. Supersedes THEOREM_FS_01/02/03/001/002 and THEO_FS_01.
category: domain
---

# Logic Shift: THEOREM_FS_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_FS_01, THEOREM_FS_02, THEOREM_FS_03, THEOREM_FS_001, THEOREM_FS_002, THEO_FS_01

## Pattern 1: Create Parent Directory Before Target (from THEOREM_FS_01)
**Discovered Pattern:** User requests a build location in a directory whose parent may not exist.

**Optimized Approach:** When a user requests a build location, ensure the parent directory exists first, then create the target build directory. For example, if the request is 'build in D:\temp\build', first check/create 'D:\temp', then create 'D:\temp\build'. This prevents errors if the parent directory is missing.

## Pattern 2: Pre-Populate Skill-Derived Files Before Operating (from THEOREM_FS_02)
**Discovered Pattern:** Attempting to read from or write to a file that does not exist, where the file's content is expected to be derived from a skill.

**Optimized Approach:** Before performing file operations on a file that is expected to contain skill content, first check for the file's existence. If it does not exist, read the content from the corresponding skill using `system__read_skill` and write that content to the file. This ensures the file is present and populated before subsequent operations.

## Pattern 3: Buffer-First Atomic Writes (from THEOREM_FS_03)
**Discovered Pattern:** Multi-step documentation generation requiring external data scraping and local filesystem persistence.

**Optimized Approach:** Implement a 'Buffer-First' strategy where scraped content is cached in a temporary memory variable before performing a single, atomic write operation to the filesystem. Prevents partial file corruption and locking issues on interrupted writes.

## Pattern 4: Ensure Directory Exists Before Script Population (from THEOREM_FS_001)
**Discovered Pattern:** Creating a new directory and populating it with files using a script.

**Optimized Approach:** When creating a new directory and subsequently populating it with files using a script (Node.js, Python, etc.), first use a system command to ensure the directory exists. Then execute the script to generate the files within the confirmed directory. This two-step process prevents write-to-nonexistent-directory errors.

## Pattern 5: Single-Command File and Directory Creation (from THEOREM_FS_002)
**Discovered Pattern:** Create a new file in a specified directory when directory existence is uncertain.

**Optimized Approach:** Utilize `execute_system_command` with `New-Item -Path 'D:\path\file.txt' -ItemType File -Force` to create the file and its parent directory in one atomic step. Prefer this over sequential `create_directory` + `write_text_file` calls when tool availability is uncertain.

## Pattern 6: Structured README Template for New Projects (from THEO_FS_01)
**Discovered Pattern:** Creating a README.md for a new project's design document.

**Optimized Approach:** When creating a README.md for a new project's design document, pre-populate it with a structured template that includes sections for Introduction, Assumptions, Proposed Workflow, Technical Stack, Configuration, and Future Enhancements. Ensures consistent and comprehensive documentation from the outset.
