// Tests the EXECUTION_GUARD injection logic in isolation.
// We extract the condition and string-build logic so it can be tested
// without spinning up the full SelectionActor LangGraph node.

describe("EXECUTION_GUARD injection logic", () => {
  function shouldInjectGuard(strategicPlan: string[], planStatus: Record<string, string>): boolean {
    const pendingSteps = strategicPlan.filter(
      (step) => (planStatus[step] || "pending") === "pending"
    );
    return pendingSteps.length >= 2;
  }

  function buildSystemPromptWithGuard(
    basePrompt: string,
    guardContent: string | null,
    shouldInject: boolean
  ): string {
    if (shouldInject && guardContent) {
      return `<skill name="EXECUTION_GUARD">\n${guardContent}\n</skill>\n\n` + basePrompt;
    }
    return basePrompt;
  }

  it("injects when 2 or more steps are pending", () => {
    const plan = ["step one", "step two", "step three"];
    const status: Record<string, string> = {};
    expect(shouldInjectGuard(plan, status)).toBe(true);
  });

  it("injects when exactly 2 steps are pending", () => {
    const plan = ["step one", "step two"];
    const status: Record<string, string> = {};
    expect(shouldInjectGuard(plan, status)).toBe(true);
  });

  it("does not inject when only 1 step is pending", () => {
    const plan = ["step one", "step two"];
    const status = { "step one": "completed" };
    expect(shouldInjectGuard(plan, status)).toBe(false);
  });

  it("does not inject when all steps are completed", () => {
    const plan = ["step one", "step two"];
    const status = { "step one": "completed", "step two": "completed" };
    expect(shouldInjectGuard(plan, status)).toBe(false);
  });

  it("does not inject when guard content is null (skill not found)", () => {
    const result = buildSystemPromptWithGuard("base", null, true);
    expect(result).toBe("base");
  });

  it("prepends guard block to system prompt when injecting", () => {
    const result = buildSystemPromptWithGuard("base prompt", "# Guard", true);
    expect(result).toMatch(/^<skill name="EXECUTION_GUARD">/);
    expect(result).toContain("# Guard");
    expect(result).toContain("base prompt");
  });

  it("returns base prompt unchanged when not injecting", () => {
    const result = buildSystemPromptWithGuard("base prompt", "# Guard", false);
    expect(result).toBe("base prompt");
  });
});
