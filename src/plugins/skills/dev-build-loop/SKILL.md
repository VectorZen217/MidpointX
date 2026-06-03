---
name: dev-build-loop
description: Use during implementation when running build tools, compilers, type-checkers, and tests. Provides a structured compile→error→fix→verify loop to reach a green build without thrashing. Use after writing-plans or executing-plans when the build is not yet clean.
---

# Dev Build Loop

## Overview

Writing code is not the same as building working software. This skill governs the iteration cycle between writing code and confirming it compiles, type-checks, and passes tests.

**Core principle:** One error class at a time. Read the full output before acting. Never "try a fix and see."

**Announce at start:** "I'm using the dev-build-loop skill to iterate toward a clean build."

## The Iron Law

```
NEVER claim a build is green without running the verification commands in this session.
NEVER act on a compiler error without reading the complete output first.
NEVER fix more than one error class per iteration.
```

## MidpointX Build Commands

| Command | Purpose | Run when |
|---------|---------|----------|
| `npx tsc --noEmit` | Type-check without emitting | After every file edit |
| `npm test` | Full Jest suite | Before committing, after type-check is clean |
| `npm run build` | Production build (frontend + tsc) | Before release, catches bundler issues |
| `npm run dev` | Dev server (backend + frontend) | Validating runtime behavior |
| `npm run backend` | Backend only | Isolating server-side issues |

---

## The Loop

Repeat this cycle until all gates pass:

```
┌─────────────────────────────────┐
│  1. Edit — make ONE targeted     │
│     change (one file, one issue) │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  2. Type-check                  │
│     npx tsc --noEmit            │
└────────────────┬────────────────┘
                 │
         ┌───────┴───────┐
       errors?         clean
         │                │
         ▼                ▼
┌──────────────┐  ┌──────────────────┐
│ 3a. Diagnose │  │  3b. Run tests   │
│  (see below) │  │  npm test        │
└──────┬───────┘  └──────┬───────────┘
       │                  │
       │           ┌──────┴──────┐
       │         fail?         pass?
       │           │               │
       │           ▼               ▼
       │    ┌─────────────┐  ┌──────────┐
       └───►│  Fix one    │  │  DONE ✓  │
            │  error class│  └──────────┘
            └─────────────┘
```

---

## Step 1: Read Before Acting

When a build fails, read the **complete** compiler output before touching any file.

**Do this:**
```bash
npx tsc --noEmit 2>&1 | head -100
```

Categorize every error:
- **Type errors** — wrong type passed to a function
- **Missing property errors** — interface mismatch
- **Import errors** — missing module or wrong path
- **Syntax errors** — unclosed brace, bad token
- **Unused variable errors** — cleanup issues

Tally the error count by category. Fix the category with the most instances first — one fix often resolves many errors.

---

## Step 2: Fix One Error Class

Pick ONE error category. Fix ALL instances of that category. Then re-run `npx tsc --noEmit`.

**Never fix two different error classes in the same iteration.** You cannot know which fix resolved which error.

### Import Errors (fix first — block everything else)
```bash
# Verify the import target actually exists
grep -r "export.*TargetName" src/
# Verify the path is correct
ls src/path/to/module.ts
```

### Type Errors
- Read the expected vs. actual types in the error message completely
- Find where the type is defined (`grep -n "interface TypeName" src/`)
- Decide: fix the caller or fix the interface? (Fix callers by default; fix interface only if the interface is wrong)
- Do NOT use `as any` to suppress a type error — find the root cause

### Missing Property Errors
- The interface changed and callers weren't updated, OR
- A caller is constructing an object that doesn't satisfy an interface
- Check when the interface last changed: `git log -p --follow src/core/state.ts | head -50`

### Syntax Errors
- These are always in the file at or just before the reported line
- Read the surrounding context — the error reporter often points to where the parser gave up, not where the mistake was made

---

## Step 3: Verify Type-Check is Clean

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

If new errors appeared after your fix: they were masked by the previous errors. Treat them as a new iteration — do not revert, just continue the loop.

---

## Step 4: Run Tests

Only after `tsc --noEmit` is clean:

```bash
npm test
```

**Read the failure output completely before acting.** For each failing test:
- Is this a test that was already failing before your change? (`git stash && npm test && git stash pop`)
- Is the test wrong, or is the implementation wrong?
- Use `systematic-debugging` skill if root cause is not immediately clear from the output

**Fix test failures one test at a time.** Do not modify multiple test files simultaneously.

---

## Step 5: Confirm No Regression

Before declaring green:

```bash
# Confirm total passing test count has not dropped
npm test -- --verbose 2>&1 | grep -E "Tests:|passed|failed"
```

If test count dropped (some tests now skipped or deleted), investigate before claiming done.

---

## Escape Conditions — Stop the Loop and Escalate

Stop the build loop and use `systematic-debugging` skill if:

- The same error reappears after 2 iterations of "fixing" it
- Fixing one error consistently introduces a different error
- The error message is ambiguous and you cannot determine the root cause
- You have completed 5+ iterations without reaching a clean type-check

Stop the build loop and ask the user if:

- A type error requires changing a public interface shared by many callers
- A test failure reveals the design is wrong (not just the implementation)
- The fix requires introducing a new dependency

---

## Quick Patterns

### "Cannot find module"
```bash
# 1. Check the file exists
ls src/path/to/module.ts
# 2. Check the export name matches the import
grep "export" src/path/to/module.ts
# 3. Check tsconfig paths
cat tsconfig.json | grep -A5 "paths"
```

### "Property X does not exist on type Y"
```bash
# Find the type definition
grep -rn "interface Y\|type Y" src/
# Check if it was recently changed
git log --oneline -5 -- $(grep -rl "interface Y" src/)
```

### "Argument of type X is not assignable to parameter of type Y"
```bash
# Find where Y is defined and what it expects
grep -rn "type Y\|interface Y" src/
# Find where X is produced
grep -rn "type X\|interface X" src/
```

### "Object is possibly undefined"
- Add a null-check guard (`if (!value) return;`)
- Or use the non-null assertion (`value!`) only if you have verified it cannot be null at this point — add a comment explaining why

---

## Handoff

When both `npx tsc --noEmit` and `npm test` exit clean:

> "Build loop complete. Type-check clean, N tests passing. Proceeding to verification."
- **NEXT SKILL:** Use `verification-before-completion` to confirm the work is genuinely done before committing.
- **THEN:** Use `finishing-a-development-branch` to integrate.
