---
name: SKILL_CREATOR
description: Create, test, and iterate on new agent skill files (SKILL.md) — covers intent capture, drafting, testing, evaluation, and improvement loops.
---

# Skill Creator

Use this skill whenever you need to author a new skill file, improve an existing skill's trigger logic, or evaluate whether a skill's instructions are clear and actionable.

## Skill Anatomy

Every skill is a Markdown file with YAML frontmatter:

```markdown
---
name: SKILL_NAME_UPPERCASE
description: One-sentence trigger description — when should this skill activate?
---

# Skill Title

[Core instructions the agent follows when this skill is active]

## When to Use
- Trigger condition 1
- Trigger condition 2

## Workflow
1. Step one
2. Step two

## Guidelines
- Guideline 1
- Guideline 2
```

## Core Workflow

### 1. Intent Capture
- Ask: What problem does this skill solve? What triggers it?
- Identify the user action or signal that should invoke the skill
- Define the expected output/deliverable

### 2. Drafting
- Write the `description:` field as a trigger sentence — it should answer "when should Claude load this skill?"
- Use progressive disclosure: put the most critical instructions first
- Explain *why* instructions matter, not just *what* to do (theory of mind)
- Keep prompts lean — remove boilerplate and redundant rules

### 3. Testing
- Spawn a fresh session and trigger the skill naturally
- Write assertions: "Given X input, the skill should produce Y"
- Grade outputs on correctness, completeness, and tone

### 4. Evaluation Criteria
- Does the skill trigger on the right inputs and NOT on unrelated ones?
- Are instructions unambiguous and free of ALL-CAPS demands?
- Does the skill complete the task without requiring follow-up clarification?
- Is the file under 150 lines (trim if not)?

### 5. Improvement Loop
- Generalize feedback from failed test cases into rule updates
- Prefer one precise rule over three vague ones
- Re-test after every change

## MidpointX Format Rules

- `name:` field: UPPERCASE_WITH_UNDERSCORES
- `description:` field: under 2 sentences, trigger-focused
- File saved to: `src/plugins/skills/<skillname>.md`
- Target length: 50–150 lines

## Security

Skills must not contain malware, exploit code, or content that could compromise system security or user privacy.
