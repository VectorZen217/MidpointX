---
name: theorem-writer
description: Scaffold a new MidpointX THEOREM skill file in src/plugins/skills/ with correct frontmatter, Logic Shift format, and structured sections. Args: <THEOREM_ID> <short-description-of-what-it-solves>
---

You are scaffolding a new MidpointX THEOREM skill file. These files form the agent's live knowledge base — each one encodes a discovered behavioral pattern or operational rule.

## Steps

1. **Parse args**: Extract `THEOREM_ID` (e.g. `THEOREM_RETRY_01`) and a short description from the user's args.

2. **Read 2 existing theorems** to internalize the exact style before writing:
   - `src/plugins/skills/THEOREM_DOCKER_SANDBOX_01.md` (complex, multi-section example)
   - `src/plugins/skills/THEOREM_SECRET_ROTATION_01.md` (workflow + table example)

3. **Determine `conceptualTags`**: Choose 1-3 tags from the theme of the description (e.g. `[security, credentials]`, `[filesystem, recovery]`, `[planning, autonomy]`).

4. **Generate a Trace ID**: Format as `MANUAL-<CATEGORY>-<NN>` where CATEGORY is the domain (e.g. `ROBUSTNESS`, `SECURITY`, `UX`, `PERFORMANCE`) and NN is a two-digit number. Use today's date for `Learned At` in ISO 8601 format.

5. **Write the file** to `src/plugins/skills/<THEOREM_ID>.md` using this exact structure:

```markdown
---
name: <THEOREM_ID>
description: <one-sentence description of what this theorem solves>
conceptualTags: [<tag1>, <tag2>]
---

# Logic Shift: <THEOREM_ID>
Trace ID: <MANUAL-CATEGORY-NN>
Learned At: <YYYY-MM-DDTHH:MM:SS.000Z>

## Justification
<Why this theorem is needed. What gap or failure mode it addresses. Reference the specific file/function/scenario that triggered it if known.>

## Discovered Pattern
<The concrete situation or code path that makes this theorem necessary. Be specific — name files, functions, or error messages.>

## <Main Section Title — name it after what the theorem defines, e.g. "Tiered Execution Model", "Rotation Workflow", "Decision Algorithm">

<The actual behavioral rules, decision trees, or procedures. Use numbered steps, tables, and sub-headers as needed. Be precise enough that the agent can follow this without ambiguity.>

## Security Constraints (if applicable)
<Any hard rules that must never be violated, prefixed with NEVER or ALWAYS.>

## Logic Shift History
<empty on creation — future improvements recorded here>
```

6. **Confirm** to the user: print the file path and a one-line summary of what the theorem encodes.

## Rules
- NEVER invent Trace IDs that conflict with existing ones — scan the skills directory first if unsure
- The `description` frontmatter must be a single sentence under 120 characters
- The main section title must describe the CONTENT, not just say "Main Logic"
- `conceptualTags` must be lowercase, hyphenated if multi-word (e.g. `credential-rotation`)
