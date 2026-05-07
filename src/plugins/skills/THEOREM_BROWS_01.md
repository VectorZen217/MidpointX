---
name: THEOREM_BROWS_01
description: browser automation, web navigation, direct access
---

# Logic Shift: THEOREM_BROWS_01
Trace ID: WEB-1777416054237
Learned At: 2026-04-28T22:41:35.477Z

## Justification
The standard approach of simply navigating to the website is the most direct and efficient method for accessing web-based services. Attempting to find the URL through search or other means would be redundant and time-consuming. This theorem codifies the direct navigation approach for common web services.

## Discovered Pattern
User requests to open a specific website or application that has a direct web URL, such as Gmail, Outlook Web, or a specific SaaS platform.

## Optimized Approach
When a user requests to access a web-based service with a known, direct URL, use the `browser__navigate` tool with the specific URL as the primary action. Avoid intermediate steps or complex site navigation unless explicitly requested or if the direct URL is unknown.
