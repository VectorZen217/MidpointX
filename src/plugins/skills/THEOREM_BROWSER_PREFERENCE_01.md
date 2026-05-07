---
name: THEOREM_BROWSER_PREFERENCE_01
description: Browser Automation, Tool Preference, Web Interaction
---

# Logic Shift: THEOREM_BROWSER_PREFERENCE_01
Trace ID: UI-1775771692047
Learned At: 2026-04-09T21:55:22.483Z

## Discovered Pattern
When the task involves interacting with a web browser, navigating to a URL, or retrieving web page content.

## Optimized Approach
Prioritize using the specialized `browser__get_page_content` or `browser__goto` tools instead of directly invoking `execute_system_command` to run browser executables. This ensures safer, more controlled, and platform-agnostic browser automation.
