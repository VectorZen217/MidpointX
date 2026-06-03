---
name: THEOREM_SYS_MASTER
description: Consolidated system operation patterns — default prompting behavior, pre-flight checks, and system status reporting. Supersedes THEOREM_SYS_01, THEOREM_SYS_001, THEO_SYS_01.
category: domain
---

# Logic Shift: THEOREM_SYS_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_SYS_01, THEOREM_SYS_001, THEO_SYS_01

## Pattern 1: Default to Direct User Prompting (from THEOREM_SYS_01)
**Discovered Pattern:** Agent is unsure of previous task and needs to prompt user.

**Optimized Approach:** When the agent cannot identify a previous task, directly prompt the user for a new task without attempting to access a task recognition skill. The default state is to await user input — no intermediate skill check needed.

## Pattern 2: Mandatory Pre-Flight Check Before Mission-Critical Tasks (from THEOREM_SYS_001)
**Discovered Pattern:** System state verification prior to process resumption.

**Optimized Approach:** Perform a mandatory pre-flight check of dependency integrity, environment configuration, and process availability using absolute paths before executing mission-critical tasks. Codifying this ensures the agent operates on a known-good state, reducing runtime errors.

## Pattern 3: Comprehensive System Status Report via PowerShell (from THEO_SYS_01)
**Discovered Pattern:** System status check requested.

**Optimized Approach:** When a system status check is requested, automatically gather CPU, Memory, Disk, Network, and key project process information using PowerShell cmdlets. Synthesize this data into a human-readable consolidated report rather than reporting individual command results separately.
