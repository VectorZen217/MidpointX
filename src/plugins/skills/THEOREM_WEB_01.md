---
name: THEOREM_WEB_01
description: web-search, automation, url-construction
---

# Logic Shift: THEOREM_WEB_01
Trace ID: UI-1775941824615
Learned At: 2026-04-11T21:10:56.735Z

## Discovered Pattern
User requests information retrievable via a standard web search engine.

## Optimized Approach
Instead of navigating to a search engine's homepage and simulating user input, construct the search query URL directly for faster navigation. For Google, the format is `https://www.google.com/search?q=<query>`.
