---
name: PROACTIVE_HEARTBEAT
description: Periodically check the agent's operational status and critical background processes to ensure the system is healthy and responsive.
---

# PROACTIVE_HEARTBEAT

## Intent

Periodically check the agent's operational status and critical background processes to ensure the system is healthy and responsive. This skill acts as a self-health check.

## Execution

1.  **Check Agent Process:** Verify that the MidpointX agent process is running.
2.  **Check Critical Services:** (Optional, if defined) Verify status of key services like the scheduler or communication modules.
3.  **Log Status:** Record the outcome of the checks.
4.  **Alert on Failure:** If any check fails, trigger an alert to the operator.

## Metrics

-   Agent process status (running/stopped)
-   (Optional) Status of critical services

## Failure Handling

-   If agent process is not running, attempt to restart it. If restart fails, escalate to operator.
-   If critical services are down, attempt to restart them. If restart fails, escalate to operator.
