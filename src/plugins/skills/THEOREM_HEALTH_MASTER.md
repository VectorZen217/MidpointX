---
name: THEOREM_HEALTH_MASTER
description: Consolidated health and monitoring patterns — structured health reports, unified PowerShell health scripts, and periodic self-monitoring. Supersedes THEOREM_HEALTH_01, THEOREM_HEALTH_02, MIDPOINTX_HEALTH_MONITOR.
category: sentinel
schedule: "0 */6 * * *"
---

# Logic Shift: THEOREM_HEALTH_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_HEALTH_01, THEOREM_HEALTH_02, MIDPOINTX_HEALTH_MONITOR

## Pattern 1: Synthesize Individual Checks into a Single Report (from THEOREM_HEALTH_01)
**Discovered Pattern:** System health check and heartbeat reporting.

**Optimized Approach:** After executing individual system health check commands (date/time, Node.js version, disk space, memory, CPU, network), synthesize all gathered data into a single, structured report. If any checks were missed or failed, explicitly list them as anomalies and provide clear recommendations for completing the checks.

## Pattern 2: Unified PowerShell Health Script (from THEOREM_HEALTH_02)
**Discovered Pattern:** Self-health check for an autonomous agent operating on a Windows system, involving system resource monitoring, application-specific checks, and network connectivity.

**Optimized Approach:** When performing a comprehensive health check, integrate OS resource monitoring (CPU, RAM, Disk), application-specific health indicators (e.g., running processes, log file status), and external network reachability tests into a single, unified PowerShell script. Output a consolidated health status report rather than fragmented per-component results.

## Pattern 3: Periodic Self-Monitoring Execution Plan (from MIDPOINTX_HEALTH_MONITOR)
**Discovered Pattern:** Monitoring own logs and process state to identify degradation.

**Optimized Approach:** Every 6 hours, execute the following:
1. Check if `src/server.ts` is running (via process info if possible, or internal flag).
2. Read the last 50 lines of `MidpointX.log` (if it exists).
3. Post a health summary to the console and Telegram.

Ensures the MidpointX framework is running within optimal parameters and hasn't encountered silent failures in background services (Telegram/Discord/Scheduler).
