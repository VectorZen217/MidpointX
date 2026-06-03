---
name: THEOREM_SKILL_DEDUPLICATION_01
description: Before synthesizing a new skill, query the existing registry for semantic overlap. Prevents the skills directory from accumulating redundant theorems that dilute RAG retrieval quality.
category: meta
conceptualTags: [skill-management, deduplication, rag]
---

# Logic Shift: THEOREM_SKILL_DEDUPLICATION_01
Trace ID: MANUAL-ROBUSTNESS-04
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The SkillAcquisitionActor synthesizes and hot-reloads new skills on every skill gap detection. With 70+ existing skills, several near-duplicate theorems already exist (THEOREM_FS_01, FS_02, THEO_FS_01, THEOREM_FS_001, THEOREM_FS_002 cover the same filesystem patterns). Each duplicate dilutes vector search recall, increases the context window load when skills are listed, and makes future consolidation harder. Checking for overlap before writing is cheaper than consolidating after accumulation.

## Discovered Pattern
`SkillAcquisitionActor` receives a `skillGapQuery` and synthesizes a new `.md` file without checking whether the gap is already partially or fully covered by an existing skill.

## Optimized Approach — Pre-Synthesis Deduplication Gate

### Step 1: Extract Key Terms
From the `skillGapQuery`, extract 3–5 core concept terms. Example: "How do I use the Docker API to check container status?" → `["docker", "container", "status", "api"]`

### Step 2: Scan Existing Skills
Load all skills from `PluginRegistry.getMDSkills()`. For each skill, check if 2+ of the key terms appear in its `name` or `description` fields (case-insensitive).

### Step 3: Classify the Match

**No match (0–1 terms):** Proceed with full synthesis. Assign the next available ID for the domain (e.g., `THEOREM_DOCKER_02` if `THEOREM_DOCKER_01` exists).

**Partial match (2 terms, different domain):** Synthesize a focused skill that explicitly extends the matching skill. Add a `# Extends: [EXISTING_SKILL_NAME]` header. Keep the new skill narrow — only the gap that existing skills do not cover.

**Strong match (3+ terms):** Do NOT synthesize a new file. Instead:
1. Load the matching skill's full content.
2. Append a `## Amendment [timestamp]` section to the existing file with the new learned pattern.
3. Call `PluginRegistry.hotReloadSkill(existingFilePath)` to refresh the registry.
4. Log: `"DEDUP: Amended [EXISTING_SKILL] instead of creating duplicate."`

### Step 4: Naming Convention Enforcement
Before writing any new skill file, verify the filename does not already exist in the skills directory. If it does (even with different content), append `_02`, `_03` etc. Never overwrite an existing skill silently.

## Consolidation Schedule (Maintenance)
Run a full deduplication audit monthly via the Observer cron:
1. Group all skills by their first domain term (e.g., all `THEOREM_FS_*`).
2. For groups with 3+ members, use the LearnActor to synthesize a merged skill.
3. Archive superseded skills to `src/plugins/skills/.archive/` — never delete them.
4. Log the consolidation as a `THEOREM_CONSOLIDATION` audit event.
