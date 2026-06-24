---
name: DEEP_RESEARCH_01
description: Professional deep research methodology — structured inquiry frameworks (PICO/SPIDER/FINER), lateral fact-checking via SIFT, bias mitigation via triangulation, and strategic report generation with inline citations. Use when conducting multi-source research, verifying claims, synthesizing evidence across sources, or producing analytical reports.
category: domain
---

# DEEP_RESEARCH_01: Professional Research Methods and Reporting

## When to Apply This Skill

**Use this skill when:**
- Tasked with researching a topic across multiple sources (web, academic, documents)
- Verifying claims or fact-checking information before including it in a response
- Synthesizing complex, multi-source evidence into a structured report
- Producing a deliverable (analysis, memo, market research) grounded in evidence

**Skip this skill for:**
- Simple factual lookups with a single authoritative source
- Internal code analysis or debugging tasks
- Tasks where the user has already provided all the source material

---

## 1. Question Formulation

Before searching, formulate a precise research question using the appropriate framework:

| Framework | Best For | Structure |
|---|---|---|
| **PICO** | Quantitative / clinical trials | Population · Intervention · Comparison · Outcome |
| **PECO** | Observational / epidemiological | Population · Exposure · Comparator · Outcome |
| **SPIDER** | Qualitative / experience-focused | Sample · Phenomenon · Design · Evaluation · Research type |
| **SPICE** | Policy / service evaluation | Setting · Perspective · Intervention · Comparison · Evaluation |
| **FINER** | Viability check on any question | Feasible · Interesting · Novel · Ethical · Relevant |

**Guiding principle:** Overly broad questions invite bias and produce ambiguous results. Always narrow the question before searching.

---

## 2. Search and Retrieval

### Boolean Query Construction
When querying databases or search engines:
- Use `AND` to narrow (both terms required), `OR` to broaden (either term acceptable), `NOT` to exclude
- Use parentheses `( )` to group logical clauses — never rely on implicit operator precedence
- Use query expansion (add synonyms) to maximize recall; use reduction (drop non-essential terms) to improve precision

### Source Prioritization
Prefer sources in this order:
1. Primary sources (original data, official documents, peer-reviewed studies)
2. Secondary sources (meta-analyses, review articles, investigative journalism with named sources)
3. Tertiary sources (encyclopedias, summaries) — for orientation only, never as evidence

---

## 3. Fact-Checking: The SIFT Method

For every claim from a non-primary source, apply lateral reading via SIFT before accepting it:

1. **Stop** — Pause before sharing or acting on a claim. Note any emotional reaction and set it aside.
2. **Investigate the Source** — Leave the page and check the author's credentials, funding, and known biases via independent sources.
3. **Find Better Coverage** — Search for independent reporting or expert consensus on the same claim. A claim confirmed by multiple independent sources is credible.
4. **Trace to the Original** — Follow citations back to the primary source. Confirm quotes and data are not cherry-picked or misrepresented.

> **Never cite a secondary source's characterization of a primary source without reading the primary.**

---

## 4. Bias Mitigation

All research is subject to cognitive bias. Apply these countermeasures actively:

- **Reflexivity:** Before searching, write down assumptions and hypotheses. Revisit them after gathering data.
- **Confirmation bias guard:** Actively search for evidence that *contradicts* the working hypothesis. A finding that holds up against disconfirming evidence is stronger.
- **Triangulation:** Combine at least two of the following to validate a key finding:
  - Multiple independent sources covering the same fact
  - Mixed methods (quantitative data + qualitative accounts)
  - Multiple theoretical or analytical frameworks
- **Adversarial questioning:** Ask "How could this finding be wrong?" and "What would a critic say?" before finalizing conclusions.

---

## 5. Synthesis and Report Generation

### Structure
- **Lead with strategic insight, not data summary.** Answer the underlying question; do not just report what was found.
- **Narrative arc:** Frame findings using *who, what, where, when, why, and how*. Connect data points through conflict and context — explain what is at stake and who is involved.
- **Human grounding:** Where appropriate, anchor abstract findings in concrete examples or cases to make them resonant.

### Citation Standard
- **Inline citations are mandatory.** Every factual claim must carry its source in the same sentence. Do not defer all citations to a sources section.
- **Sources section is supplementary.** A consolidated list at the end aids export/reference but does not substitute for inline attribution.
- **Citation format:** Link or attribute as close to the claim as possible — `[Author/Source, Year]` or a hyperlink inline.

### Writing Conventions for Investigative Reports
These rules may be broken intentionally for impact:
- *Default: avoid first person* → **Break it** if direct participation is the evidence thread
- *Default: chronological structure* → **Break it** to prioritize weight of evidence over timeline
- *Default: answer all 5 Ws* → **Break it** when a hanging question exposes a systemic failure more powerfully than an answer

---

## 6. AI-Augmented Research: Guardrails

When using AI tools (including this agent) during research:

- **Frame the problem independently first.** Do not delegate problem framing to AI — that is the highest-value human judgment in the workflow.
- **Treat AI output as a draft, not a finding.** Always verify AI-generated claims against primary sources.
- **Red-team AI outputs:** Ask "Give me a counter-argument" or "How could this conclusion be wrong?" to surface blind spots.
- **Avoid cognitive debt:** Using AI to shortcut synthesis erodes the researcher's own judgment over time. Use it to accelerate retrieval and drafting, not to replace reasoning.

---

## 7. Execution Checklist

- [ ] Research question formulated using PICO/SPIDER/SPICE/FINER (whichever fits)
- [ ] Search strategy defined: key terms, Boolean operators, source types
- [ ] At least 2–3 independent primary or secondary sources per key claim
- [ ] SIFT applied to all non-primary sources
- [ ] Disconfirming evidence actively sought
- [ ] Triangulation applied to core findings
- [ ] Report leads with strategic insight, not data dump
- [ ] All factual claims carry inline citations
- [ ] Adversarial review: "How could this be wrong?"
- [ ] Sources section consolidated at end
