---
name: [SKILL_NAME_UPPERCASE_01]
description: [A short, 1-2 sentence description of what this API/Skill enables the agent to do]
---

# Logic Shift / Dynamic Skill: [Skill Name]
Trace ID: [Trace ID or "Dynamic Discovery"]
Learned At: [Current Timestamp]

## 1. Purpose & Capabilities
[Explain what this API/service is, what domain it covers, and the specific actions the agent can now perform using it.]

## 2. Authentication Method
[Strictly define how to authenticate. E.g., "Use Bearer token from GCP Secret Manager key X" or "Append ?api_key=Y to the URL". Provide exact header formats.]

## 3. Base URL & Critical Endpoints
[List the Base URL. Then list the critical endpoints required to fulfill the capabilities mentioned in section 1. For each endpoint, include the method (GET/POST) and required payload structure.]

## 4. Execution Steps (Standard Operating Procedure)
[Provide a rigorous, step-by-step guide on how the LLM should sequence its native tools (e.g., `browser__navigate`, `filesystem__write_text_file`, or direct HTTP fetch via code if available) to execute requests against this API. Include error handling expectations.]
