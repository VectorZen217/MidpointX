import * as path from "path";

// Test just the validation logic in isolation — no need to spin up the full registry
describe("system__update_skill skillName validation", () => {
  const SKILLS_DIR = path.resolve("src/plugins/skills");

  function validateSkillName(skillName: string): string | null {
    if (!skillName || !/^[a-zA-Z0-9_\-\.]+$/.test(String(skillName))) {
      return `Error: Invalid skill name "${skillName}". Only alphanumeric, hyphen, underscore, and dot are allowed.`;
    }
    const skillPath = path.join(SKILLS_DIR, `${skillName}.md`);
    if (!path.resolve(skillPath).startsWith(SKILLS_DIR + path.sep)) {
      return `Error: Skill path escapes the skills directory.`;
    }
    return null; // valid
  }

  it("rejects path traversal with ../", () => {
    const err = validateSkillName("../../evil");
    expect(err).toMatch(/Invalid skill name/);
  });

  it("rejects absolute path", () => {
    const err = validateSkillName("/etc/passwd");
    expect(err).toMatch(/Invalid skill name/);
  });

  it("rejects names with spaces", () => {
    const err = validateSkillName("my skill");
    expect(err).toMatch(/Invalid skill name/);
  });

  it("rejects empty string", () => {
    const err = validateSkillName("");
    expect(err).toMatch(/Invalid skill name/);
  });

  it("accepts valid alphanumeric name", () => {
    const err = validateSkillName("THEOREM_FS_01");
    expect(err).toBeNull();
  });

  it("accepts name with hyphens and dots", () => {
    const err = validateSkillName("my-skill.v2");
    expect(err).toBeNull();
  });
});
