# MidpointX Performance and Testing Log

## Current State (2026-05-14 — Phase 5)

All 36 tests pass across 11 test suites. The three failures documented below were resolved during Phase 4 hardening.

---

## ✅ Resolved Issues

### 1. `ChannelRouter` Test Failures — RESOLVED
- **Root Cause**: Tests used `expect(response).toBe("string")` but the router now returns `{ message, telemetry }`.
- **Fix**: Updated all channelRouter tests to use `toMatchObject({ message: "..." })`. Added `MemoryManager` mock.
- **Session**: `cb26fd36` / `967c0d6c`

### 2. Temporal Contextual Observation (FFMPEG Burst Capture) — RESOLVED
- **Root Cause**: Test was trying to mutate a read-only `fs.existsSync` getter.
- **Fix**: Moved `temporal.test.ts` to `tests/temporal.test.ts` with corrected `jest.mock("fs")` using spread of `requireActual`. All ScreenCapture tests now pass.
- **Session**: `b78861d5`

### 3. Agent Window Lifecycle Management — RESOLVED
- **Root Cause**: `hideAgentWindow` / `restoreAgentWindow` called `writeFile` from a destructured import that was undefined in test context.
- **Fix**: ScreenCapture now imports `writeFile` from `fs/promises` at module level. Tests mock `fs/promises` fully.
- **Session**: `b78861d5`

### 4. False-Positive Failure Loop Detection — RESOLVED
- **Root Cause**: `SelectionActor` used broad string matching (`result.includes("Error")`) which flagged successful tool responses mentioning "Error count: 0".
- **Fix**: Replaced with structured JSON parsing (`parsed.status === "error"`). Only unambiguous failure markers trigger recovery.
- **Session**: `cb26fd36`

---

## Phase 4/5 Improvements Landed

| Feature | Status |
|---------|--------|
| Structured failure detection (JSON status parsing) | ✅ |
| MCP output sanitization (extract text from CallToolResult) | ✅ |
| Redundant-success circuit breaker (2x identical success → complete) | ✅ |
| Death spiral detector (3x identical call → force replan) | ✅ |
| Prompt-level synthesis instruction (check history before calling) | ✅ |
| Dynamic compaction threshold (token-budget based, not action count) | ✅ |
| Per-mission turn budget enforcement (MAX_TURNS_PER_MISSION) | ✅ |
| Auto session logging after every mission | ✅ |
| Turn/token telemetry in agent response | ✅ |
| executionNodes.test.ts — loop/sanitization/circuit-breaker coverage | ✅ |

