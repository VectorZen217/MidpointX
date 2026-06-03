---
name: THEOREM_OUTPUT_VALIDATION_01
description: Before returning finalOutcome, verify all claimed artifacts actually exist and are valid. Prevents silent failures from being reported as successes.
conceptualTags: [output-validation, artifact-verification, quality-assurance]
---

# Logic Shift: THEOREM_OUTPUT_VALIDATION_01
Trace ID: MANUAL-ROBUSTNESS-01
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The ExecutionActor trusts tool result strings at face value. A tool can return `{ status: "success" }` while the artifact it claimed to produce (a file, a compiled binary, a live URL) does not actually exist or is empty. This produces a false positive finalOutcome that misleads the user. An explicit validation gate before closing the loop catches these silent failures.

## Discovered Pattern
Any task that produces a tangible artifact — a written file, a compiled output, a URL, a database record — can silently fail if the execution layer returns a success status without confirming the artifact's existence or integrity.

## Optimized Approach
Before the CompactionActor writes `finalOutcome`, run a validation pass against every artifact claimed in `outputArtifacts` and the last tool result. Apply the appropriate check per artifact type:

### Artifact Validation Rules

**File artifacts:**
1. Use `filesystem__get_file_info` or `filesystem__read_file` on the claimed path.
2. Confirm the file exists AND has non-zero size (`size > 0`).
3. If the file is code (`.ts`, `.js`, `.py`), run a syntax check: `npx tsc --noEmit` for TypeScript, `python3 -m py_compile` for Python.

**Compiled binary / build output:**
1. Confirm the `dist/` or build directory contains the expected entry point.
2. Run a smoke test: `node dist/server.js --dry-run` or equivalent.

**URLs:**
1. Issue a HEAD request via `fetch__fetch` to the claimed URL.
2. Confirm HTTP status is 2xx or 3xx. Any 4xx/5xx is a validation failure.

**Database records:**
1. Re-query the record by its primary key.
2. Confirm the returned value matches what was written.

### On Validation Failure
1. Set `isTaskComplete = false`.
2. Populate `failureThesis` with: `"VALIDATION_FAILURE: [artifact type] at [location] — [reason]"`.
3. Increment `replanCount`.
4. Route back to SupervisorActor for targeted remediation (do NOT start over — pass the specific failure as the new sub-goal).

### On Validation Success
1. Append a `VALIDATED` tag to each artifact entry in `outputArtifacts`.
2. Proceed to CompactionActor normally.

## Edge Cases
- If the artifact type is unknown, log a warning but do not block finalOutcome.
- If validation tooling itself fails (e.g., `tsc` not installed), fall back to file-existence check only and note the limitation in finalOutcome.
- Never re-run the full task to validate — use the lightest possible confirmation check.
