import { SandboxManager } from "../core/sandboxManager";

describe("SandboxManager.buildDockerArgs", () => {
  it("passes cmd as the last argv element after sh -c, not interpolated", () => {
    const args = SandboxManager.buildDockerArgs("echo $(id)", "/workspace");
    const shIdx = args.indexOf("sh");
    expect(shIdx).toBeGreaterThan(0);
    expect(args[shIdx + 1]).toBe("-c");
    expect(args[shIdx + 2]).toBe("echo $(id)"); // literal – never expanded by outer shell
  });

  it("mounts workspace as :ro", () => {
    const args = SandboxManager.buildDockerArgs("ls", "/my/path");
    const volIdx = args.indexOf("--volume");
    expect(volIdx).toBeGreaterThan(-1);
    expect(args[volIdx + 1]).toMatch(/:ro$/);
  });

  it("converts Windows backslashes in workspacePath", () => {
    const args = SandboxManager.buildDockerArgs("ls", "C:\\Users\\randy\\proj");
    const volIdx = args.indexOf("--volume");
    expect(args[volIdx + 1]).toMatch(/^C:\/Users\/randy\/proj/);
  });

  it("does not merge flags into single strings (argv only)", () => {
    const args = SandboxManager.buildDockerArgs("ls", "/w");
    expect(args[0]).toBe("run"); // first element is sub-command, not 'docker run ...'
    expect(args.every((a: string) => !a.includes(" --"))).toBe(true);
  });
});
