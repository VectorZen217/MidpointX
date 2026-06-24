---
name: THEOREM_BROWSER_01
description: browser automation, default application, tool selection
---

# Logic Shift: THEOREM_BROWSER_01
Trace ID: WEB-1781985763700
Learned At: 2026-06-20T20:03:41.626Z

## Justification
The standard approach of using 'browser__open' is the most efficient and reliable method for opening the default browser. No alternative approach is necessary or more optimal for this specific, common task. This theorem codifies the direct use of the appropriate tool.

## Discovered Pattern
User requests to open the default browser.

## Optimized Approach
Utilize the 'browser__open' skill directly. This skill is purpose-built for opening the default browser and abstracts away the underlying implementation details, ensuring consistency and reliability.
