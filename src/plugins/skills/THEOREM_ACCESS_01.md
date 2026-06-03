---
name: THEOREM_ACCESS_01
description: AccessStrategy, ResourceDiscovery, Efficiency
category: domain
---

# Logic Shift: THEOREM_ACCESS_01
Trace ID: TELEGRAM-1778862090395
Learned At: 2026-05-15T16:22:20.109Z

## Justification
Attempting to scrape or automate authenticated web interfaces without pre-established session persistence leads to high failure rates and wasted compute. Confirming local availability first eliminates unnecessary network overhead.

## Discovered Pattern
Target resource requires authentication or is behind a non-API-accessible web interface.

## Optimized Approach
Prioritize local file system indexing and metadata search before attempting browser automation or API calls.
