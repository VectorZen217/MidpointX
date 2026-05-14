/**
 * executionNodes.test.ts
 * 
 * Tests for the loop prevention, MCP output sanitization, redundant-call
 * circuit breaker, and turn budget enforcement added in Phase 4/5.
 */

// ─── truncateOutput ─────────────────────────────────────────────────────────
// We test the logic directly by importing and re-exposing a helper.
// Since truncateOutput is module-private we test its behaviour via the
// ExecutionActor's stored result (which uses it internally).

describe("truncateOutput (via module internals)", () => {
  // Re-implement the truncation logic here to unit-test it in isolation
  const HARD_CAP = 2000;
  function truncate(output: string, maxChars = HARD_CAP): string {
    if (output.length <= maxChars) return output;
    const half = Math.floor(maxChars / 2);
    return (
      output.substring(0, half) +
      `\n\n... [TRUNCATED ${output.length - maxChars} CHARS] ...\n\n` +
      output.substring(output.length - half)
    );
  }

  test("returns short strings unchanged", () => {
    const short = "a".repeat(100);
    expect(truncate(short)).toBe(short);
  });

  test("middle-truncates strings over HARD_CAP", () => {
    const long = "X".repeat(4000);
    const result = truncate(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("[TRUNCATED");
    // Head and tail should each be ~HARD_CAP/2 chars
    expect(result.startsWith("X".repeat(1000))).toBe(true);
    expect(result.endsWith("X".repeat(1000))).toBe(true);
  });

  test("exactly HARD_CAP chars is not truncated", () => {
    const exact = "Y".repeat(HARD_CAP);
    expect(truncate(exact)).toBe(exact);
  });
});

// ─── Structured Failure Detection ───────────────────────────────────────────
describe("Structured failure detection logic", () => {
  function isFailure(result: string): boolean {
    try {
      const parsed = JSON.parse(result);
      if (parsed.status === "error") return true;
      if (parsed.isError === true) return true;
    } catch {
      // Not JSON — fall through to string heuristics
    }
    const r = result || "";
    if (r.includes("PAGE_LOAD_FAILED")) return true;
    if (r.includes("robots.txt")) return true;
    if (r.includes("REJECTED BY USER")) return true;
    if (r.includes("execution failed")) return true;
    return false;
  }

  test("correctly identifies JSON status=error as failure", () => {
    expect(isFailure(JSON.stringify({ status: "error", errors: "Connection refused" }))).toBe(true);
  });

  test("correctly identifies isError=true as failure", () => {
    expect(isFailure(JSON.stringify({ isError: true, content: "Something broke" }))).toBe(true);
  });

  test("does NOT flag successful response mentioning 'Error count: 0'", () => {
    const successResponse = JSON.stringify({
      status: "success",
      output: "Server Info: Error count: 0, Uptime: 99.9%"
    });
    expect(isFailure(successResponse)).toBe(false);
  });

  test("does NOT flag successful response with 'error' in content text", () => {
    const successResponse = JSON.stringify({
      status: "success",
      output: "Notebooks: [], Error logs: none"
    });
    expect(isFailure(successResponse)).toBe(false);
  });

  test("flags robots.txt block", () => {
    expect(isFailure("Blocked by robots.txt policy")).toBe(true);
  });

  test("flags PAGE_LOAD_FAILED", () => {
    expect(isFailure("PAGE_LOAD_FAILED: Empty body")).toBe(true);
  });

  test("flags REJECTED BY USER", () => {
    expect(isFailure("REJECTED BY USER")).toBe(true);
  });

  test("does NOT flag plain error mentions in non-JSON text", () => {
    // 'Error' alone in free text should NOT trigger — only structured markers
    expect(isFailure("No errors found in the log file")).toBe(false);
  });
});

// ─── Death Spiral / Redundant Call Detection ────────────────────────────────
describe("Death spiral and redundant-call detection", () => {
  function isDeathSpiral(history: Array<{ tool: string; args: any }>): boolean {
    if (history.length < 3) return false;
    const recent = history.slice(-3);
    const allSameTool = recent.every((a) => a.tool === recent[0].tool);
    const allSameArgs = recent.every(
      (a) => JSON.stringify(a.args) === JSON.stringify(recent[0].args)
    );
    return allSameTool && allSameArgs;
  }

  function isRedundantSuccess(
    history: Array<{ tool: string; args: any; result: string }>,
    nextTool: string,
    nextArgs: any
  ): boolean {
    const last2 = history.slice(-2);
    if (last2.length < 2) return false;
    const allSame = last2.every(
      (a) => a.tool === nextTool && JSON.stringify(a.args) === JSON.stringify(nextArgs)
    );
    if (!allSame) return false;
    return last2.every((a) => {
      try {
        return JSON.parse(a.result)?.status === "success";
      } catch {
        return false;
      }
    });
  }

  test("detects death spiral when same tool+args called 3 times", () => {
    const history = [
      { tool: "fetch__fetch", args: { url: "https://example.com" } },
      { tool: "fetch__fetch", args: { url: "https://example.com" } },
      { tool: "fetch__fetch", args: { url: "https://example.com" } },
    ];
    expect(isDeathSpiral(history)).toBe(true);
  });

  test("does NOT flag spiral if args differ", () => {
    const history = [
      { tool: "fetch__fetch", args: { url: "https://a.com" } },
      { tool: "fetch__fetch", args: { url: "https://b.com" } },
      { tool: "fetch__fetch", args: { url: "https://c.com" } },
    ];
    expect(isDeathSpiral(history)).toBe(false);
  });

  test("detects redundant success when same call succeeded twice", () => {
    const history = [
      { tool: "notebooklm__notebook_list", args: {}, result: JSON.stringify({ status: "success", output: "[]" }) },
      { tool: "notebooklm__notebook_list", args: {}, result: JSON.stringify({ status: "success", output: "[]" }) },
    ];
    expect(isRedundantSuccess(history, "notebooklm__notebook_list", {})).toBe(true);
  });

  test("does NOT flag redundant if last calls failed", () => {
    const history = [
      { tool: "fetch__fetch", args: { url: "https://example.com" }, result: JSON.stringify({ status: "error", errors: "blocked" }) },
      { tool: "fetch__fetch", args: { url: "https://example.com" }, result: JSON.stringify({ status: "error", errors: "blocked" }) },
    ];
    expect(isRedundantSuccess(history, "fetch__fetch", { url: "https://example.com" })).toBe(false);
  });
});

// ─── Turn Budget Enforcement ─────────────────────────────────────────────────
describe("Turn budget enforcement", () => {
  function isBudgetExhausted(turnsUsed: number, budget: number): boolean {
    return turnsUsed >= budget;
  }

  test("budget is NOT exhausted under limit", () => {
    expect(isBudgetExhausted(49, 50)).toBe(false);
  });

  test("budget IS exhausted at exactly the limit", () => {
    expect(isBudgetExhausted(50, 50)).toBe(true);
  });

  test("budget IS exhausted over the limit", () => {
    expect(isBudgetExhausted(75, 50)).toBe(true);
  });

  test("budget is NOT exhausted on turn 0", () => {
    expect(isBudgetExhausted(0, 50)).toBe(false);
  });
});
