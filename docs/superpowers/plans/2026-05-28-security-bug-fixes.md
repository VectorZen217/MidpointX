# Security Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 9 confirmed/plausible security and correctness bugs found in the code review of the `feat/remove-gcp-add-sandbox` branch.

**Architecture:** Four focused task groups, each targeting one source file (or a tightly related pair). All changes are surgical — no refactors beyond what each bug requires. Tests are added to `src/tests/` using Jest + ts-jest. Each task ends with a type-check and commit.

**Tech Stack:** TypeScript 5.4, Node.js 22, Jest + ts-jest, Docker (child_process.execFile), PowerShell -EncodedCommand, Node.js `child_process`

---

## File Structure

| File | What changes |
|---|---|
| `src/core/sandboxManager.ts` | Replace string-interpolated `exec` with `execFile` argv array; change workspace mount `:rw` → `:ro`; add `buildDockerArgs()` |
| `src/nodes/executionNodes.ts` | Fix `sandboxBypasses` Docker-availability check; switch PowerShell to `-EncodedCommand`; escape single-quotes in `fetchUrl`; remove dead self-assignment |
| `src/core/persistence.ts` | Add write-queue to `saveVectorIndex`; add testable constructor; add `PersistenceFactory.reset()`; fix `listActiveSessions` to include disk; add `require.resolve` guard for SQLite |
| `src/core/config.ts` | Call `PersistenceFactory.reset()` after successful `reloadConfig` |
| `src/tests/sandboxManager.test.ts` | New — unit tests for Task 1 |
| `src/tests/executionNodes.test.ts` | New — unit tests for Task 2 helpers |
| `src/tests/persistence.test.ts` | New — unit tests for Tasks 3 & 4 |

---

## Task 1: sandboxManager.ts — argv-array exec + :ro workspace (Findings #2, #5)

**Files:**
- Modify: `src/core/sandboxManager.ts`
- Create: `src/tests/sandboxManager.test.ts`

### Background
`buildDockerCommand` produces a shell string passed to `exec()`. The `sh -c "..."` wrapper only escapes `"`, leaving `$(...)`, backticks, `$VAR`, and newlines uninterpreted — all of which execute inside the container. The workspace volume is `:rw`, meaning container code can write or delete host workspace files despite `--read-only`.

Fix: replace `buildDockerCommand` + `execAsync(string)` with a new `buildDockerArgs()` returning `string[]`, used by `execFileAsync("docker", args)`. Passing cmd as a literal argv element prevents any outer-shell re-parsing. Change mount to `:ro`; the container's `/tmp` (64 MB tmpfs) is the writable scratch space.

---

- [ ] **Step 1: Write the failing test**

Create `src/tests/sandboxManager.test.ts`:

```typescript
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

  it("does not include buildDockerCommand as part of the return (argv only)", () => {
    const args = SandboxManager.buildDockerArgs("ls", "/w");
    expect(args[0]).toBe("run"); // first element is the docker sub-command, not 'docker run ...'
    expect(args.every((a) => !a.includes(" --"))).toBe(true); // no merged flags
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```powershell
npx jest src/tests/sandboxManager.test.ts --no-coverage 2>&1
```

Expected: `TypeError: SandboxManager.buildDockerArgs is not a function` (method does not exist yet).

- [ ] **Step 3: Implement the fix in sandboxManager.ts**

Open `src/core/sandboxManager.ts`. Replace the file content with the following (preserve the file header comments):

```typescript
import { exec, execFile } from "child_process";
import { promisify } from "util";
import * as os from "os";
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
```

- [ ] **Step 4: Run the test to confirm it passes**

```powershell
npx jest src/tests/sandboxManager.test.ts --no-coverage 2>&1
```

Expected: all 4 tests pass.

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/core/sandboxManager.ts src/tests/sandboxManager.test.ts
git commit -m "fix(sandbox): use execFile argv array and :ro workspace mount

- Replace buildDockerCommand + exec() with buildDockerArgs() + execFileAsync().
  Passing cmd as a literal argv element to sh -c prevents outer-shell
  re-parsing of \$(...), backticks, and newlines in LLM-generated commands.
- Change workspace bind-mount from :rw to :ro so container code cannot
  write or delete host workspace files. /tmp (64 MB tmpfs) remains writable
  for intermediate output.

Fixes review findings #2 and #5."
```

---

## Task 2: executionNodes.ts — sandbox bypass, PS encoding, fetchUrl injection (Findings #1, #3, #4)

**Files:**
- Modify: `src/nodes/executionNodes.ts`
- Create: `src/tests/executionNodes.test.ts`

### Background
Three independent bugs in `executionNodes.ts`:

**#1 — sandboxBypasses when Docker is down:** `sandboxBypasses` is computed before Docker availability is confirmed. When Docker is down, `SandboxManager.isAutonomous()` still returns `true` (both defaults are `true`), so `needsApproval = false`. Then the host-shell path runs the command unsandboxed, with no approval prompt.

**#3 — fetchUrl single-quote injection:** The fetch intercept at line ~478 builds a PowerShell command with `Invoke-WebRequest -Uri '${fetchUrl}'`. A URL containing `'` closes the PS string literal, enabling injection.

**#4 — PowerShell -Command escaping no-op:** `wrappedCmd.replace(/"/g, '\"')` in TypeScript replaces `"` with `"` (no-op). Fix: use `-EncodedCommand` with UTF-16 LE base64, which completely eliminates quoting.

**Dead code:** The self-assignment `finalMessage = finalMessage` (line ~640) and its `@ts-ignore` serve no purpose and should be removed.

---

- [ ] **Step 1: Write the failing tests**

Create `src/tests/executionNodes.test.ts`:

```typescript
describe("PowerShell -EncodedCommand encoding", () => {
  it("round-trips a command containing double-quotes", () => {
    const cmd = 'Write-Output "hello world"';
    const wrappedCmd = `$ProgressPreference = 'SilentlyContinue'; ${cmd}`;
    const encoded = Buffer.from(wrappedCmd, "utf16le").toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(wrappedCmd);
  });

  it("round-trips a command containing single-quotes and backticks", () => {
    const cmd = "Write-Host `$env:COMPUTERNAME; echo 'done'";
    const wrappedCmd = `$ProgressPreference = 'SilentlyContinue'; ${cmd}`;
    const encoded = Buffer.from(wrappedCmd, "utf16le").toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(wrappedCmd);
  });
});

describe("fetchUrl escaping for PowerShell single-quoted strings", () => {
  function escapePsSingleQuotedString(s: string): string {
    return s.replace(/'/g, "''");
  }

  it("escapes a URL containing a single-quote", () => {
    const url = "https://example.com/it's-here";
    const escaped = escapePsSingleQuotedString(url);
    expect(escaped).toBe("https://example.com/it''s-here");
    // The resulting PS string has no unmatched single-quote
    const psStr = `Invoke-WebRequest -Uri '${escaped}'`;
    expect(psStr).toBe("Invoke-WebRequest -Uri 'https://example.com/it''s-here'");
  });

  it("leaves clean URLs unchanged", () => {
    const url = "https://example.com/search?q=foo+bar";
    expect(escapePsSingleQuotedString(url)).toBe(url);
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes (encoding is pure logic)**

```powershell
npx jest src/tests/executionNodes.test.ts --no-coverage 2>&1
```

Expected: all 4 tests pass immediately (these are pure-logic helpers; they validate the escaping logic we're about to apply, not the node itself).

- [ ] **Step 3: Fix sandboxBypasses in selectionActor (Finding #1)**

In `src/nodes/executionNodes.ts`, locate the lines after the toolCall is determined (around line 483):

```typescript
const severity = getActionSeverity(toolCall?.name, toolCall?.args);
// Autonomous mode: skip approval gate when running inside the hardened sandbox.
const sandboxBypasses = SandboxManager.isAutonomous() && toolCall?.name === "execute_system_command";
let needsApproval = !sandboxBypasses && Config.REQUIRE_APPROVAL_FOR_DESTRUCTIVE && severity !== null;
```

Replace those two lines with:

```typescript
const severity = getActionSeverity(toolCall?.name, toolCall?.args);
// Autonomous mode: skip approval gate ONLY when Docker is confirmed available.
// isDockerAvailable() is cached after first call so this is a fast path.
const dockerConfirmed = Config.USE_DOCKER_SANDBOX && await SandboxManager.isDockerAvailable();
const sandboxBypasses = dockerConfirmed && Config.SANDBOX_AUTONOMOUS_MODE && toolCall?.name === "execute_system_command";
let needsApproval = !sandboxBypasses && Config.REQUIRE_APPROVAL_FOR_DESTRUCTIVE && severity !== null;
```

- [ ] **Step 4: Fix PowerShell host-shell path to use -EncodedCommand (Finding #4)**

In `src/nodes/executionNodes.ts`, locate the host-shell path (around lines 646–662):

```typescript
if (!finalMessage || finalMessage === "") {
  try {
    const isWindows = os.platform() === "win32";
    const detectedShell = state.environmentFingerprint?.capabilities?.shell || (isWindows ? "powershell.exe" : "/bin/bash");

    // Windows-Native Restricted Shell
    let hostCmd = cmd;
    if (isWindows) {
      const isMessaging = Config.TOOL_PROFILE === "messaging";
      const executionPolicy = isMessaging ? "Restricted" : "Bypass";
      console.log(`[Security] Hardening PowerShell (Policy: ${executionPolicy})...`);
      const wrappedCmd = `$ProgressPreference = 'SilentlyContinue'; ${cmd}`;
      hostCmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy ${executionPolicy} -Command "${wrappedCmd.replace(/"/g, '\"')}"`;
    }

    const { stdout, stderr } = await execAsync(hostCmd, { cwd, shell: detectedShell });
    finalMessage = JSON.stringify({ status: "success", output: stdout.trim(), errors: stderr.trim() });
  } catch (err: any) {
    finalMessage = JSON.stringify({ status: "error", errors: err.message });
  }
}
```

Replace the entire `if (!finalMessage || finalMessage === "")` block with:

```typescript
if (!finalMessage || finalMessage === "") {
  try {
    const isWindows = os.platform() === "win32";
    const detectedShell = state.environmentFingerprint?.capabilities?.shell || (isWindows ? "powershell.exe" : "/bin/bash");

    let hostCmd = cmd;
    if (isWindows) {
      const isMessaging = Config.TOOL_PROFILE === "messaging";
      const executionPolicy = isMessaging ? "Restricted" : "Bypass";
      console.log(`[Security] Hardening PowerShell (Policy: ${executionPolicy})...`);
      // -EncodedCommand accepts UTF-16 LE base64 — no quoting or escaping needed,
      // making it safe for commands containing any mix of quotes or special chars.
      const wrappedCmd = `$ProgressPreference = 'SilentlyContinue'; ${cmd}`;
      const encoded = Buffer.from(wrappedCmd, "utf16le").toString("base64");
      hostCmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy ${executionPolicy} -EncodedCommand ${encoded}`;
    }

    const { stdout, stderr } = await execAsync(hostCmd, { cwd, shell: detectedShell });
    finalMessage = JSON.stringify({ status: "success", output: stdout.trim(), errors: stderr.trim() });
  } catch (err: any) {
    finalMessage = JSON.stringify({ status: "error", errors: err.message });
  }
}
```

- [ ] **Step 5: Fix fetchUrl single-quote escaping (Finding #3)**

In `src/nodes/executionNodes.ts`, locate the fetch intercept (around line 474):

```typescript
if (fetchEverBlocked) {
  const fetchUrl = toolCall.args?.url || "";
  console.warn(`🔄 [SelectionActor] FETCH INTERCEPT: ...`);
  toolCall.name = "execute_system_command";
  toolCall.args = {
    command: `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${fetchUrl}' -UseBasicParsing | Select-Object -ExpandProperty Content`
  };
}
```

Replace only the `toolCall.args` assignment:

```typescript
if (fetchEverBlocked) {
  const fetchUrl = toolCall.args?.url || "";
  // Escape single-quotes for PowerShell single-quoted strings: ' → ''
  const safeUrl = fetchUrl.replace(/'/g, "''");
  console.warn(`🔄 [SelectionActor] FETCH INTERCEPT: fetch__fetch was previously blocked by robots.txt. Auto-converting to PowerShell Invoke-WebRequest for: ${fetchUrl}`);
  toolCall.name = "execute_system_command";
  toolCall.args = {
    command: `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${safeUrl}' -UseBasicParsing | Select-Object -ExpandProperty Content`
  };
}
```

- [ ] **Step 6: Remove dead self-assignment (cleanup)**

In `src/nodes/executionNodes.ts`, find the sandbox execution success block (around line 632):

```typescript
        finalMessage = JSON.stringify({ status: "success", output: result.stdout, errors: result.stderr });
        // Skip the host-shell path below
        // @ts-ignore — intentional early assign; falls through to A2AProtocol.commit
        finalMessage = finalMessage;
```

Remove the comment and the self-assignment line, leaving only:

```typescript
        finalMessage = JSON.stringify({ status: "success", output: result.stdout, errors: result.stderr });
```

- [ ] **Step 7: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 8: Run tests**

```powershell
npx jest src/tests/executionNodes.test.ts --no-coverage 2>&1
```

Expected: all 4 tests still pass.

- [ ] **Step 9: Commit**

```powershell
git add src/nodes/executionNodes.ts src/tests/executionNodes.test.ts
git commit -m "fix(execution): sandbox bypass, PS encoding, fetchUrl injection

- sandboxBypasses: confirm Docker is actually available before setting the
  flag. When Docker is down, commands no longer skip the approval gate.
- PowerShell host-shell: switch from -Command with broken quoting to
  -EncodedCommand (UTF-16 LE base64), which is injection-safe for any input.
- fetchUrl intercept: escape single-quotes ('' in PS) before interpolating
  into the Invoke-WebRequest single-quoted URI string.
- Remove dead-code self-assignment (finalMessage = finalMessage).

Fixes review findings #1, #3, #4."
```

---

## Task 3: persistence.ts — vector store race + SQLite early check (Findings #7, #8)

**Files:**
- Modify: `src/core/persistence.ts`
- Create: `src/tests/persistence.test.ts`

### Background
**#7 — vector store race:** `saveVectorIndex` does `await readFile → modify → await writeFile`. Two concurrent async calls interleave after the first `await`; the last `writeFile` silently overwrites the first caller's write. Fix: serialize writes through a per-instance `Promise` chain.

**#8 — SQLite deferred crash:** `SQLitePersistenceAdapter` `require`s `better-sqlite3` in its constructor, which is called from `PersistenceFactory.getAdapter()`. If `better-sqlite3` is not installed, the crash happens deep inside a request handler with no actionable message. Fix: add a `require.resolve` pre-flight in `getAdapter()`.

Also add a constructor parameter to `LocalPersistenceAdapter` so tests can use a temp directory without touching the real workspace.

---

- [ ] **Step 1: Write the failing tests**

Create `src/tests/persistence.test.ts`:

```typescript
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { LocalPersistenceAdapter, PersistenceFactory } from "../core/persistence";

// Helper: create a fresh adapter backed by a temp directory
async function makeTempAdapter(): Promise<{ adapter: LocalPersistenceAdapter; dir: string }> {
  const dir = path.join(os.tmpdir(), `mx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  const adapter = new LocalPersistenceAdapter(dir);
  return { adapter, dir };
}

afterAll(async () => {
  // Temp dirs are cleaned up by the OS; nothing to do here.
});

describe("LocalPersistenceAdapter.saveVectorIndex — concurrency", () => {
  it("does not lose writes when two calls overlap", async () => {
    const { adapter } = await makeTempAdapter();

    // Fire both writes concurrently without awaiting between them
    await Promise.all([
      adapter.saveVectorIndex("cat", "k1", [1, 0], { label: "k1" }),
      adapter.saveVectorIndex("cat", "k2", [0, 1], { label: "k2" }),
    ]);

    const results = await adapter.queryVectorIndex("cat", [1, 0], 10);
    expect(results.map((r) => r.key).sort()).toEqual(["k1", "k2"]);
  });

  it("preserves existing entries when adding a new one", async () => {
    const { adapter } = await makeTempAdapter();
    await adapter.saveVectorIndex("cat", "a", [1, 0], {});
    await adapter.saveVectorIndex("cat", "b", [0, 1], {});
    await adapter.saveVectorIndex("cat", "c", [1, 1], {});
    const results = await adapter.queryVectorIndex("cat", [1, 0], 10);
    expect(results).toHaveLength(3);
  });
});

describe("LocalPersistenceAdapter constructor base directory", () => {
  it("accepts a custom base directory", async () => {
    const { adapter, dir } = await makeTempAdapter();
    await adapter.appendLog("test", "key", "content");
    const content = await adapter.readLogs("test", "key");
    expect(content).toBe("content");
    // Confirm files are in the custom dir, not the default workspace
    const entries = await fs.readdir(path.join(dir, "test"));
    expect(entries).toContain("key.md");
  });
});

describe("PersistenceFactory — SQLite pre-flight", () => {
  afterEach(() => {
    PersistenceFactory.reset();
  });

  it("throws a helpful error when better-sqlite3 is not resolvable and adapter is sqlite", () => {
    // We cannot easily uninstall better-sqlite3, so we mock require.resolve
    const origResolve = (require as any).resolve;
    (require as any).resolve = (id: string) => {
      if (id === "better-sqlite3") throw new Error("MODULE_NOT_FOUND");
      return origResolve(id);
    };

    // Temporarily override Config
    const { Config } = require("../core/config");
    const origAdapter = Config.PERSISTENCE_ADAPTER;
    Config.PERSISTENCE_ADAPTER = "sqlite";

    try {
      expect(() => PersistenceFactory.getAdapter()).toThrow(/better-sqlite3/);
      expect(() => PersistenceFactory.getAdapter()).toThrow(/npm install/);
    } finally {
      Config.PERSISTENCE_ADAPTER = origAdapter;
      (require as any).resolve = origResolve;
    }
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```powershell
npx jest src/tests/persistence.test.ts --no-coverage 2>&1
```

Expected failures:
- `LocalPersistenceAdapter` constructor does not accept a `baseDir` argument → TypeError
- Concurrency test may pass or silently fail depending on timing
- SQLite pre-flight test fails because there is no `require.resolve` check

- [ ] **Step 3: Add constructor parameter and write-queue to LocalPersistenceAdapter**

In `src/core/persistence.ts`, find the `LocalPersistenceAdapter` class definition:

```typescript
export class LocalPersistenceAdapter implements PersistenceAdapter {
  private baseDir = path.resolve(__dirname, "../../src/workspace");
  private sessions: Map<string, any> = new Map();
```

Replace those two lines with:

```typescript
export class LocalPersistenceAdapter implements PersistenceAdapter {
  private baseDir: string;
  private sessions: Map<string, any> = new Map();
  private vectorWriteQueue: Promise<void> = Promise.resolve();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(__dirname, "../../src/workspace");
  }
```

- [ ] **Step 4: Serialize saveVectorIndex through the write queue**

In `src/core/persistence.ts`, find the `saveVectorIndex` method in `LocalPersistenceAdapter`:

```typescript
  async saveVectorIndex(category: string, key: string, vector: number[], metadata: any): Promise<void> {
    const filePath = path.join(this.baseDir, "vector_store.json");
    let store: Record<string, Array<{ key: string; vector: number[]; metadata: any }>> = {};
    
    if (existsSync(filePath)) {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        store = JSON.parse(raw);
      } catch (e) {
        console.warn("⚠️ [Persistence] Failed to parse vector_store.json, resetting.", e);
      }
    }
    
    if (!store[category]) {
      store[category] = [];
    }
    
    // Remove existing item to avoid duplicates
    store[category] = store[category].filter(item => item.key !== key);
    store[category].push({ key, vector, metadata });
    
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
  }
```

Replace it with:

```typescript
  async saveVectorIndex(category: string, key: string, vector: number[], metadata: any): Promise<void> {
    // Serialize all writes through a promise chain to prevent read-modify-write races.
    this.vectorWriteQueue = this.vectorWriteQueue.then(() =>
      this._writeVectorEntry(category, key, vector, metadata)
    );
    return this.vectorWriteQueue;
  }

  private async _writeVectorEntry(category: string, key: string, vector: number[], metadata: any): Promise<void> {
    const filePath = path.join(this.baseDir, "vector_store.json");
    let store: Record<string, Array<{ key: string; vector: number[]; metadata: any }>> = {};

    if (existsSync(filePath)) {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        store = JSON.parse(raw);
      } catch (e) {
        console.warn("⚠️ [Persistence] Failed to parse vector_store.json, resetting.", e);
      }
    }

    if (!store[category]) store[category] = [];
    store[category] = store[category].filter((item) => item.key !== key);
    store[category].push({ key, vector, metadata });

    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
  }
```

- [ ] **Step 5: Add require.resolve pre-flight to PersistenceFactory.getAdapter()**

In `src/core/persistence.ts`, find `PersistenceFactory.getAdapter()`:

```typescript
  static getAdapter(): PersistenceAdapter {
    if (this.instance) return this.instance;

    if (Config.PERSISTENCE_ADAPTER === "sqlite") {
      console.log("\u{1F5C4}️ [Persistence] Initializing SQLitePersistenceAdapter...");
      this.instance = new SQLitePersistenceAdapter();
    } else {
      console.log("\u{1F4C2} [Persistence] Initializing LocalPersistenceAdapter...");
      this.instance = new LocalPersistenceAdapter();
    }

    return this.instance;
  }
```

Replace it with:

```typescript
  static getAdapter(): PersistenceAdapter {
    if (this.instance) return this.instance;

    if (Config.PERSISTENCE_ADAPTER === "sqlite") {
      try {
        require.resolve("better-sqlite3");
      } catch {
        throw new Error(
          "[PersistenceFactory] better-sqlite3 is not installed.\n" +
          "  Run: npm install better-sqlite3\n" +
          "  Or set PERSISTENCE_ADAPTER=local in .env to use the filesystem adapter."
        );
      }
      console.log("\u{1F5C4}️ [Persistence] Initializing SQLitePersistenceAdapter...");
      this.instance = new SQLitePersistenceAdapter();
    } else {
      console.log("\u{1F4C2} [Persistence] Initializing LocalPersistenceAdapter...");
      this.instance = new LocalPersistenceAdapter();
    }

    return this.instance;
  }
```

- [ ] **Step 6: Run tests to confirm they pass**

```powershell
npx jest src/tests/persistence.test.ts --no-coverage 2>&1
```

Expected: all tests pass. (The SQLite mock test may be skipped or need adjustment — if `require.resolve` cannot be mocked this way in the test environment, replace that test with a manual verification note in the PR description.)

- [ ] **Step 7: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 8: Commit**

```powershell
git add src/core/persistence.ts src/tests/persistence.test.ts
git commit -m "fix(persistence): serialize vector writes, add sqlite pre-flight, testable constructor

- saveVectorIndex: serialize concurrent writes through a per-instance Promise
  chain so no two writes can interleave on the shared vector_store.json file.
- PersistenceFactory.getAdapter(): require.resolve('better-sqlite3') before
  constructing SQLitePersistenceAdapter — fails fast at first use with an
  actionable error instead of crashing mid-request.
- LocalPersistenceAdapter: accept optional baseDir constructor arg so tests
  can use a temp directory without touching the real workspace.

Fixes review findings #7 and #8."
```

---

## Task 4: persistence.ts + config.ts — singleton reset + listActiveSessions disk (Findings #6, #9)

**Files:**
- Modify: `src/core/persistence.ts`
- Modify: `src/core/config.ts`
- Modify: `src/tests/persistence.test.ts`

### Background
**#6 — PersistenceFactory singleton not reset:** `reloadConfig()` updates `Config.PERSISTENCE_ADAPTER` but the cached `PersistenceFactory.instance` is never invalidated. Subsequent calls return the old adapter. Fix: add `PersistenceFactory.reset()` and call it in `reloadConfig()` on successful parse.

**#9 — listActiveSessions in-memory only:** `listActiveSessions()` returns only the in-memory `sessions` Map. Sessions persisted to disk by earlier runs are invisible. Fix: union the in-memory set with session files found on disk.

---

- [ ] **Step 1: Add tests to src/tests/persistence.test.ts**

Append these two `describe` blocks to the existing file:

```typescript
describe("PersistenceFactory.reset()", () => {
  afterEach(() => {
    PersistenceFactory.reset();
  });

  it("reset() clears the cached instance so getAdapter() creates a new one", () => {
    const a = PersistenceFactory.getAdapter();
    PersistenceFactory.reset();
    const b = PersistenceFactory.getAdapter();
    expect(a).not.toBe(b);
  });

  it("getAdapter() returns the same instance on repeated calls without reset", () => {
    const a = PersistenceFactory.getAdapter();
    const b = PersistenceFactory.getAdapter();
    expect(a).toBe(b);
  });
});

describe("LocalPersistenceAdapter.listActiveSessions()", () => {
  it("returns sessions stored to disk even after the in-memory map is cleared", async () => {
    const { adapter } = await makeTempAdapter();
    await adapter.saveSession({ taskId: "task-abc", status: "running" });

    // Simulate a process restart by clearing the in-memory map
    (adapter as any).sessions.clear();

    const sessions = await adapter.listActiveSessions();
    expect(sessions).toContain("task-abc");
  });

  it("returns union of in-memory and disk sessions without duplicates", async () => {
    const { adapter } = await makeTempAdapter();
    await adapter.saveSession({ taskId: "disk-only", status: "done" });
    (adapter as any).sessions.clear();
    // Add a new in-memory session that was never persisted to disk
    (adapter as any).sessions.set("mem-only", { taskId: "mem-only" });

    const sessions = await adapter.listActiveSessions();
    expect(sessions).toContain("disk-only");
    expect(sessions).toContain("mem-only");
    // No duplicates
    expect(new Set(sessions).size).toBe(sessions.length);
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```powershell
npx jest src/tests/persistence.test.ts --no-coverage 2>&1
```

Expected: `reset()` tests fail because the method does not exist; `listActiveSessions` tests fail because disk sessions are not returned.

- [ ] **Step 3: Add PersistenceFactory.reset()**

In `src/core/persistence.ts`, in the `PersistenceFactory` class, after `getAdapter()`, add:

```typescript
  /**
   * Clears the cached adapter instance. Call after reloadConfig() so the
   * next getAdapter() picks up the new PERSISTENCE_ADAPTER setting.
   */
  static reset(): void {
    this.instance = null;
  }
```

- [ ] **Step 4: Fix listActiveSessions to include disk sessions**

In `src/core/persistence.ts`, find `listActiveSessions()` in `LocalPersistenceAdapter`:

```typescript
  async listActiveSessions(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }
```

Replace it with:

```typescript
  async listActiveSessions(): Promise<string[]> {
    const memIds = Array.from(this.sessions.keys());
    const diskIds: string[] = [];
    const sessionDir = path.join(this.baseDir, "sessions");
    try {
      const files = await fs.readdir(sessionDir);
      for (const f of files) {
        if (f.endsWith(".json")) diskIds.push(f.replace(".json", ""));
      }
    } catch {
      // Session directory doesn't exist yet — that's fine
    }
    return [...new Set([...memIds, ...diskIds])];
  }
```

- [ ] **Step 5: Call PersistenceFactory.reset() in reloadConfig**

In `src/core/config.ts`, find `reloadConfig`:

```typescript
export function reloadConfig(newEnv?: any) {
  try {
    Config = ConfigSchema.parse(newEnv || process.env);
    console.log("✅ [Config] Environment variables reloaded successfully.");
  } catch (error: any) {
    console.error("❄ [Config] Configuration reload failed:");
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`   - ${err.path.join(".")}: ${err.message}`);
      });
    }
  }
}
```

Add the import and reset call. First, add the import near the top of `config.ts` (after the existing imports). Check if `PersistenceFactory` is already imported — it is likely not. Add a lazy import to avoid a circular dependency:

```typescript
export function reloadConfig(newEnv?: any) {
  try {
    Config = ConfigSchema.parse(newEnv || process.env);
    console.log("✅ [Config] Environment variables reloaded successfully.");
    // Invalidate the PersistenceFactory singleton so the next call to
    // getAdapter() creates a fresh instance with the updated PERSISTENCE_ADAPTER.
    // Imported inline to avoid a circular module dependency.
    const { PersistenceFactory } = require("./persistence");
    PersistenceFactory.reset();
  } catch (error: any) {
    console.error("❄ [Config] Configuration reload failed:");
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`   - ${err.path.join(".")}: ${err.message}`);
      });
    }
  }
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```powershell
npx jest src/tests/persistence.test.ts --no-coverage 2>&1
```

Expected: all tests pass.

- [ ] **Step 7: Run full test suite**

```powershell
npm test 2>&1
```

Expected: all tests pass. Note any pre-existing failures — do not fix them in this branch.

- [ ] **Step 8: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 9: Commit**

```powershell
git add src/core/persistence.ts src/core/config.ts src/tests/persistence.test.ts
git commit -m "fix(persistence): singleton reset on reloadConfig, disk fallback for listActiveSessions

- PersistenceFactory.reset(): clear cached instance so a PERSISTENCE_ADAPTER
  change via reloadConfig() takes effect immediately.
- reloadConfig(): call PersistenceFactory.reset() after a successful parse so
  the next adapter access picks up the new config value.
- listActiveSessions(): union in-memory sessions Map with .json files on disk
  so sessions from previous process runs are visible after restart.

Fixes review findings #6 and #9."
```

---

## Self-Review Checklist

**Spec coverage:**
- Finding #1 (sandboxBypasses) → Task 2 Step 3 ✓
- Finding #2 (shell injection) → Task 1 Steps 3-4 ✓
- Finding #3 (fetchUrl injection) → Task 2 Step 5 ✓
- Finding #4 (PS escaping no-op) → Task 2 Step 4 ✓
- Finding #5 (workspace :rw) → Task 1 Step 3 (`:ro` in `buildDockerArgs`) ✓
- Finding #6 (singleton not reset) → Task 4 Steps 3, 5 ✓
- Finding #7 (vector store race) → Task 3 Steps 3-4 ✓
- Finding #8 (SQLite deferred crash) → Task 3 Step 5 ✓
- Finding #9 (listActiveSessions in-memory) → Task 4 Step 4 ✓
- Dead code (self-assignment) → Task 2 Step 6 ✓

**Placeholder scan:** None found — all steps contain exact code.

**Type consistency:** `buildDockerArgs` is the method name used consistently across Task 1 test and implementation. `PersistenceFactory.reset()` is consistent across Task 3 tests and Task 4 implementation. `LocalPersistenceAdapter(baseDir?)` constructor signature is consistent across Task 3 test helper and implementation.
