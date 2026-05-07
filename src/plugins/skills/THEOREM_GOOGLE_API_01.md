---
name: THEOREM_GOOGLE_API_01
description: google-calendar-api, api-access, user-guidance
---

# Logic Shift: THEOREM_GOOGLE_API_01
Trace ID: TELEGRAM-1777736177575
Learned At: 2026-05-02T15:37:00.120Z

## Justification
The standard approach of repeatedly attempting to use Google Calendar API tools when the API is known to be disabled is inefficient and leads to user frustration. This theorem introduces a proactive user-guidance step to resolve the underlying API access issue, which is a prerequisite for successful tool execution. It also offers alternative paths forward, respecting user time and priorities.

## Discovered Pattern
Google Calendar API is disabled or inaccessible.

## Optimized Approach
When encountering a disabled Google Calendar API, proactively guide the user to enable it in the Google Cloud Console. Provide clear, step-by-step instructions for enabling the API and then re-attempting the tool usage. If the user cannot enable it immediately, suggest alternative methods for retrieving event information (e.g., if the user can provide an exported calendar file) or offer to proceed with other tasks.
