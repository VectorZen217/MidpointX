import { exec, execFile } from "child_process";
import { promisify } from "util";
import { Config } from "./config";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface SandboxResult {
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * SandboxManager: Manages the Docker sandbox lifecycle for MidpointX.
 * Provides isolated, resource-capped execution with no host network access.
 * Falls back to host shell with a loud warning if Docker is unavailable.
 */
export class SandboxManager {
  private static _dockerAvailable: boolean | null = null;
  static readonly BASE_IMAGE = "node:20-alpine";

  /**
   * Returns true if Docker is installed and the daemon is reachable.
   * Result is cached after first check.
   */
  static async isDockerAvailable(): Promise<boolean> {
    if (this._dockerAvailable !== null) return this._dockerAvailable;
    try {
      await execAsync("docker info --format '{{.ServerVersion}}'", { timeout: 5000 });
      this._dockerAvailable = true;
    } catch {
      this._dockerAvailable = false;
    }
    return this._dockerAvailable;
  }

  /**
   * Checks that the base image is present locally; pulls it if not.
   * Called once at startup so first-run latency is predictable.
   */
  static async ensureBaseImage(): Promise<void> {
    try {
      const { stdout } = await execAsync(`docker image inspect ${this.BASE_IMAGE} --format "{{.Id}}"`, { timeout: 10000 });
      if (stdout.trim()) {
        console.log(`[SandboxManager] Base image ${this.BASE_IMAGE} already present.`);
        return;
      }
    } catch {
      // Image not found locally — pull it
    }
    console.log(`[SandboxManager] Pulling base image ${this.BASE_IMAGE}...`);
    await execAsync(`docker pull ${this.BASE_IMAGE}`, { timeout: 120000 });
    console.log(`[SandboxManager] Base image ready.`);
  }

  /**
   * Returns the docker run argv array for execFile.
   * cmd is passed as a literal argv element to sh -c — no outer-shell
   * re-parsing occurs, so $(...), backticks, and quotes in cmd are safe.
   *
   * Security constraints:
   *   --network=none      no outbound internet from inside the container
   *   --memory=512m       hard memory cap
   *   --cpus=0.5          half a CPU core max
   *   --pids-limit=64     prevent fork bombs
   *   --read-only         immutable container filesystem
   *   --tmpfs /tmp        writable scratch space in RAM only (64 MB)
   *   :ro                 workspace bind-mount is read-only; container cannot
   *                       modify host files — use /tmp for intermediate output
   */
  static buildDockerArgs(cmd: string, workspacePath: string): string[] {
    const mountPath = workspacePath.replace(/\\/g, "/");
    return [
      "run", "--rm",
      "--network=none",
      "--memory=512m",
      "--cpus=0.5",
      "--pids-limit=64",
      "--read-only",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
      "--security-opt=no-new-privileges",
      "--cap-drop=ALL",
      "--volume", `${mountPath}:/workspace:ro`,
      "--workdir", "/workspace",
      this.BASE_IMAGE,
      "sh", "-c", cmd,
    ];
  }

  /**
   * Runs a shell command inside the Docker sandbox.
   * Uses execFile (not exec) so the argv array is passed directly to the OS
   * without any shell re-parsing of the docker arguments.
   *
   * @param cmd       The shell command to execute inside the container
   * @param cwd       Host path to mount as /workspace (read-only)
   * @param timeoutMs Execution timeout in milliseconds (default: 60s)
   */
  static async runInSandbox(cmd: string, cwd: string, timeoutMs = 60_000): Promise<SandboxResult> {
    const args = this.buildDockerArgs(cmd, cwd);
    console.log(`[SandboxManager] Executing in sandbox...`);

    try {
      const { stdout, stderr } = await execFileAsync("docker", args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: stdout.trim(), stderr: stderr.trim(), timedOut: false };
    } catch (err: any) {
      if (err.killed || err.signal === "SIGTERM") {
        return { stdout: "", stderr: `Sandbox execution timed out after ${timeoutMs}ms`, timedOut: true };
      }
      return { stdout: err.stdout?.trim() || "", stderr: err.stderr?.trim() || err.message, timedOut: false };
    }
  }

  /**
   * Returns true if sandbox mode is active AND autonomous mode is enabled.
   * When true, sandboxed commands skip the destructive-action approval gate.
   * NOTE: callers must independently confirm Docker is available before relying
   * on this flag — isAutonomous() does not check Docker availability.
   */
  static isAutonomous(): boolean {
    return Config.USE_DOCKER_SANDBOX && Config.SANDBOX_AUTONOMOUS_MODE;
  }

  /**
   * Resets the cached Docker availability check (useful for tests).
   */
  static resetCache(): void {
    this._dockerAvailable = null;
  }
}
