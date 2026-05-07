---
name: THEOREM_CAL_01
description: calendar, automation, workflow
---

# Logic Shift: THEOREM_CAL_01
Trace ID: PROACTIVE-travel-concierge-workflow-1777744800032
Learned At: 2026-05-02T18:01:22.246Z

## Justification
The standard approach of simply listing calendar events is insufficient if the returned data lacks the necessary detail (like event descriptions or full IDs) to accurately determine if the user is traveling. Directly calling `get_calendar_event` for each listed event bypasses the need to re-query the list with potentially unsupported parameters and ensures all required information is fetched efficiently, thus preventing a deadlock in the workflow.

## Discovered Pattern
Retrieving calendar event details for travel state detection when initial list call returns truncated or insufficient data.

## Optimized Approach
When `google-calendar__list_calendar_events` is used and the output is insufficient to determine travel status (e.g., missing full event details or IDs), the agent should immediately proceed to use `google-calendar__get_calendar_event` for each event ID returned. This ensures that the necessary details for accurate travel state detection are obtained without requiring a separate, potentially redundant, API call to `list_calendar_events` with different parameters.
