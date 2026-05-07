---
name: autonomous-researcher
description: Autonomous multi-step web research and knowledge synthesis. Use when a user asks for deep research, comprehensive guides, or to "learn everything" about a complex topic.
---

# Autonomous Researcher

This skill enables an autonomous, recursive research workflow to deeply understand complex topics without user intervention.

## Core Workflow

1. **Deconstruction**: Break the main query into 3-5 specific sub-questions or technical terms that need definition.
2. **Recursive Search**:
    - Use `google_web_search` or `web_search_exa` for each sub-question.
    - Read the most relevant results using `web_fetch`.
    - **Crucial**: If a source mentions a new, unfamiliar concept relevant to the goal, add it to the research queue and search for it immediately.
3. **Verification**: Cross-reference key facts across at least two different sources.
4. **Synthesis**:
    - Use `assets/research-report-template.md` to structure the final findings.
    - Write for a technical audience, focusing on actionable data and architectural impacts.
5. **Persistence**: Save the final report to the project's `docs/research/` or `knowledge/` directory.

## Guidelines

- **Autonomy**: Do not ask "should I continue?" or "which link should I click?". Follow the "scent" of information until the objectives are met.
- **Depth**: Prefer official documentation, whitepapers, and technical blogs (engineering blogs) over surface-level news articles.
- **Transparency**: Always list the specific URLs used in the "Sources & References" section.
- **Failure Handling**: If a search yields no results, pivot by searching for broader terms or related technologies.
## MANDATORY: Reflect & Learn (Automatic)
Before finishing, you MUST execute the 'Reflect & Learn' phase. Log the task outcome, any non-obvious patterns, or errors to the workspace '.memory/' directory using the 'self-improvement' signal schema. If a correction occurred, you MUST immediately invoke the 'self-improvement' skill to propose a permanent fix.
