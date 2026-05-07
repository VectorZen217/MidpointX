---
name: academic-researcher
description: Multi-step deep research across academic and industry sources. Use for literature reviews, "State of the Art" reports, and identifying technical consensus vs. conflict across public data.
---

# Academic Researcher & Synthesizer

This skill provides a senior-level research workbench for deep technical synthesis.

## Workflows

### 1. Deep Research Orchestration
Use `scripts/orchestrate_search.cjs` to break a topic into technical sub-queries and chain searches.

### 2. High-Signal Filtering
Use `scripts/filter_signal.cjs` to prioritize authoritative domains from `references/domains/whitelist.json`.

### 3. Synthesis & Reporting
Follow the synthesis logic in this SKILL.md to extract claims and generate a report using `assets/report_template.md`.

### 4. Self-Improvement
Log high-signal sources via `scripts/log_research_path.cjs` to `.researcher/memory/DOMAINS.json`.
