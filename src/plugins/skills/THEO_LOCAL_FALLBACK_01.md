---
name: THEO_LOCAL_FALLBACK_01
description: Resilience, Data-Persistence, Error-Handling
---

# Logic Shift: THEO_LOCAL_FALLBACK_01
Trace ID: TELEGRAM-1778803499133
Learned At: 2026-05-15T00:05:37.180Z

## Justification
Standard workflows often fail when relying on third-party APIs. By defaulting to a local-first storage strategy, we ensure the user receives their requested data immediately, maintaining productivity despite external service outages.

## Discovered Pattern
External API service (Google Workspace/Cloud) failure during automated data export

## Optimized Approach
Automatically generate a structured local artifact (CSV/JSON) and provide the absolute path to the user before notifying of the service failure.
