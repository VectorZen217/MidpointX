---
name: THEOREM_BROWSER_01
description: fallback, web scraping, content retrieval
---

# Logic Shift: THEOREM_BROWSER_01
Trace ID: TELEGRAM-1777742325667
Learned At: 2026-05-02T17:19:59.743Z

## Justification
The standard approach relies on browser automation tools. When these tools are unavailable, the agent must have a fallback mechanism to still attempt to fulfill the request. Using `fetch__fetch` provides a way to access website content, allowing for partial or complete task fulfillment in degraded environments. This prevents task failure solely due to tool unavailability.

## Discovered Pattern
Agent is unable to use browser automation tools (e.g., `browser__navigate`, `browser__evaluate`) but can use `fetch__fetch` to retrieve website content.

## Optimized Approach
When browser automation tools are unavailable, default to using `fetch__fetch` to retrieve website content. Subsequently, parse the fetched content to fulfill the user's request. If the task requires interaction (e.g., filling forms, clicking buttons), inform the user about the limitations and offer alternative approaches.
