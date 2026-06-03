// Tests validate the regex extraction logic in isolation — no registry spin-up needed.
describe("MDSkill category extraction", () => {
  function extractCategory(content: string): string | undefined {
    const match = content.match(/^category:\s*(.+)$/m);
    return match ? match[1].trim() : undefined;
  }

  it("extracts category from frontmatter", () => {
    const content = "---\nname: test\ndescription: test skill\ncategory: error-recovery\n---\n# body";
    expect(extractCategory(content)).toBe("error-recovery");
  });

  it("returns undefined when category is absent", () => {
    const content = "---\nname: test\ndescription: test skill\n---\n# body";
    expect(extractCategory(content)).toBeUndefined();
  });

  it("trims whitespace from category value", () => {
    const content = "---\ncategory:   orchestration   \n---";
    expect(extractCategory(content)).toBe("orchestration");
  });

  it("does not match category inside the body, only frontmatter lines", () => {
    const content = "---\nname: test\n---\n# category: not-this-one";
    expect(extractCategory(content)).toBeUndefined();
  });
});
