---
name: THEOREM_API_DISCOVERY_01
description: Procedure for ingesting external API documentation and generating a new dynamic skill without RAG infrastructure.
---

# Logic Shift: API Discovery and Skill Synthesis
Trace ID: Core Logic
Learned At: 2026-05-13T12:00:00Z

## Justification
MidpointX must be able to dynamically expand its capabilities by reading external documentation and converting that knowledge into actionable standard operating procedures (Skills) that it can hot-load.

## Discovered Pattern
By reading full documentation pages into context via the browser or native fetch tools, the agent can extract all necessary constraints (Auth, Endpoints) and synthesize a `SKILL_TEMPLATE.md` compliant file to permanently retain the capability.

## Optimized Approach (The Recursive Architect Workflow)
When instructed to "learn" or "integrate" a new API:

1. **Ingestion**: 
   - Use `browser__navigate` or read raw text/HTML to fetch the API documentation URL provided by the user.
   - Read the content fully into context. Do not attempt to use RAG or chunking unless the document exceeds context limits.

2. **Extraction**:
   - Identify the exact Base URL.
   - Identify the Authentication method (e.g., Bearer Token, API Key in header, query param).
   - Identify the core endpoints required for the requested capabilities.

3. **Synthesis**:
   - Draft a new skill strictly following the structure outlined in `src/plugins/skills/SKILL_TEMPLATE.md`.
   - Ensure the "Execution Steps" section explicitly tells the agent *how* to use its existing native tools (like fetch or browser) to interact with this specific API.

4. **Verification (Dry Run)**:
   - Before saving, the agent MUST perform a test request (Dry Run) against a safe endpoint (e.g., a `GET` request or a `/ping` endpoint) to verify the auth and base URL are correct.
   - Only proceed if the verification step is successful or explicitly overridden by the user.

5. **Hot-Loading**:
   - Use the `system__update_skill` tool to save the synthesized markdown content. Provide a distinct, uppercase name for the skill (e.g., `WEATHER_API_01`).
   - The system will automatically hot-load this new capability into your active tools registry.
