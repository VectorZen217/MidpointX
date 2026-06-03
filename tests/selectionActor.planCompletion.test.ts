// Tests the plan-step completion logic in SelectionActor's no-tool-call path.
// Reproduces the infinite-loop bug where a text-only step assigned by Supervisor
// (status: 'pending', never promoted to 'active') was never marked completed,
// causing hasPendingSteps to stay true and routing back to Supervisor forever.

describe("SelectionActor no-tool-call plan completion", () => {
  // Mirrors the CURRENT (buggy) logic at executionNodes.ts:449-451
  function markCompletedBuggy(
    currentPlan: string[],
    planStatus: Record<string, string>
  ): Record<string, string> {
    const updated = { ...planStatus };
    const activeStep = currentPlan.find((step) => updated[step] === "active");
    if (activeStep) {
      updated[activeStep] = "completed";
    }
    return updated;
  }

  // Mirrors the FIXED logic
  function markCompletedFixed(
    currentPlan: string[],
    planStatus: Record<string, string>
  ): Record<string, string> {
    const updated = { ...planStatus };
    const activeStep = currentPlan.find((step) => updated[step] === "active");
    const stepToComplete =
      activeStep ?? currentPlan.find((step) => updated[step] === "pending");
    if (stepToComplete) {
      updated[stepToComplete] = "completed";
    }
    return updated;
  }

  function hasPendingSteps(currentPlan: string[], planStatus: Record<string, string>): boolean {
    return currentPlan.some((step) => planStatus[step] === "pending");
  }

  // ── Bug reproduction ─────────────────────────────────────────────────────
  it("BUG: pending-only step is NOT marked completed by current logic", () => {
    const plan = ["Communicate result to user"];
    const status = { "Communicate result to user": "pending" };

    const updated = markCompletedBuggy(plan, status);

    // Bug: step stays pending, so hasPendingSteps is true → loop
    expect(updated["Communicate result to user"]).toBe("pending");
    expect(hasPendingSteps(plan, updated)).toBe(true);
  });

  // ── Fix verification ─────────────────────────────────────────────────────
  it("FIX: pending-only step IS marked completed", () => {
    const plan = ["Communicate result to user"];
    const status = { "Communicate result to user": "pending" };

    const updated = markCompletedFixed(plan, status);

    expect(updated["Communicate result to user"]).toBe("completed");
    expect(hasPendingSteps(plan, updated)).toBe(false);
  });

  it("FIX: active step is still marked completed when present", () => {
    const plan = ["Query calendar", "Report results"];
    const status = { "Query calendar": "completed", "Report results": "active" };

    const updated = markCompletedFixed(plan, status);

    expect(updated["Report results"]).toBe("completed");
    expect(hasPendingSteps(plan, updated)).toBe(false);
  });

  it("FIX: active step takes priority over pending step", () => {
    const plan = ["Step A", "Step B", "Step C"];
    const status = { "Step A": "completed", "Step B": "active", "Step C": "pending" };

    const updated = markCompletedFixed(plan, status);

    // Should complete the active step, not Step C
    expect(updated["Step B"]).toBe("completed");
    expect(updated["Step C"]).toBe("pending"); // untouched
    expect(hasPendingSteps(plan, updated)).toBe(true); // Step C still pending
  });

  it("FIX: first pending step is marked completed when multiple pending exist", () => {
    const plan = ["Step A", "Step B"];
    const status = { "Step A": "pending", "Step B": "pending" };

    const updated = markCompletedFixed(plan, status);

    expect(updated["Step A"]).toBe("completed");
    expect(updated["Step B"]).toBe("pending"); // second step untouched
    expect(hasPendingSteps(plan, updated)).toBe(true); // still one pending
  });

  it("FIX: no-op when all steps are already completed", () => {
    const plan = ["Step A"];
    const status = { "Step A": "completed" };

    const updated = markCompletedFixed(plan, status);

    expect(updated["Step A"]).toBe("completed");
    expect(hasPendingSteps(plan, updated)).toBe(false);
  });
});
