---
name: THEOREM_USER_PROMPT_CLARIFICATION_01
description: user interaction, clarification, artifact management
category: orchestration
---

# Logic Shift: THEOREM_USER_PROMPT_CLARIFICATION_01
Trace ID: TELEGRAM-1780075134720
Learned At: 2026-05-29T17:19:02.360Z

## Justification
The standard approach of attempting to fulfill an ambiguous request can lead to errors or the creation of incorrect artifacts. This theorem ensures that the agent first clarifies intent, thereby increasing the success rate of subsequent actions and reducing unnecessary processing.

## Discovered Pattern
User requests to save an artifact that was not explicitly generated or provided in the immediate prior turn.

## Optimized Approach
Instead of proceeding with an ambiguous request, proactively prompt the user for specific details regarding the artifact (e.g., content, name, source) before attempting to save it. This prevents wasted cycles and ensures accurate fulfillment.
