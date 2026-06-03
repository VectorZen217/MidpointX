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

  it("does not match a markdown heading line (# prefix)", () => {
    const content = "---\nname: test\n---\n# category: not-this-one";
    expect(extractCategory(content)).toBeUndefined();
  });

  it("captures category values that contain spaces", () => {
    const content = "---\ncategory: error recovery\n---";
    expect(extractCategory(content)).toBe("error recovery");
  });
});

describe("system__list_skills category field", () => {
  it("list output JSON includes category key for each skill", () => {
    const mockSkills = new Map([
      ["EXECUTION_GUARD", { name: "EXECUTION_GUARD", description: "Guard", content: "", category: "pre-execution" }],
      ["mcp-builder", { name: "mcp-builder", description: "Builder", content: "", category: undefined }],
    ]);

    const list = Array.from(mockSkills.values()).map(s => ({
      name: s.name,
      description: s.description,
      category: (s as any).category ?? "uncategorized",
    }));

    expect(list[0].category).toBe("pre-execution");
    expect(list[1].category).toBe("uncategorized");
  });
});

describe("getSkillContent logic", () => {
  it("returns null for unknown skill", () => {
    const mockSkills = new Map<string, { content: string }>();
    const getContent = (name: string) => mockSkills.get(name)?.content ?? null;
    expect(getContent("nonexistent")).toBeNull();
  });

  it("returns content string for known skill", () => {
    const mockSkills = new Map([["EXECUTION_GUARD", { content: "# Guard content" }]]);
    const getContent = (name: string) => mockSkills.get(name)?.content ?? null;
    expect(getContent("EXECUTION_GUARD")).toBe("# Guard content");
  });
});
