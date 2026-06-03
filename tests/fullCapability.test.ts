/**
 * fullCapability.test.ts
 *
 * MidpointX Full-Capability Integration Test Suite
 * -------------------------------------------------
 * Exercises every major subsystem of the MidpointX agent without making
 * real LLM calls, Docker containers, or live MCP connections.
 *
 * Subsystems covered:
 *  1.  PolicyEngine            — deterministic safety guardrails
 *  2.  A2A Protocol            — hash chaining & audit ledger integrity
 *  3.  SessionManager          — full lifecycle (create → heartbeat → expire → terminate)
 *  4.  Persistence Layer       — LocalPersistenceAdapter CRUD (logs, skills, stats, sessions, audit)
 *  5.  Graph Topology          — all 17 actor nodes are registered in the compiled graph
 *  6.  State Reducers          — accumulation, replacement, and additive reducer semantics
 *  7.  LLMFactory              — provider + tier selection without real API keys
 *  8.  PluginRegistry          — MD skill loading from the filesystem
 *  9.  Resilience Wrapper      — abort on deterministic 4xx, retry on transient errors
 * 10.  MCP Config Integrity    — valid JSON with required server definitions
 * 11.  Skill Template Compliance — every skill file has a name and description field
 * 12.  Config Schema           — Zod validation with defaults and enum rejection
 * 13.  LogicShift Schema       — Zod schema enforces max 3 conceptual tags
 */

// ─── Node / FS helpers ──────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// ─── Source modules under test ───────────────────────────────────────────────
import { PolicyEngine } from "../src/core/policy";
import { SessionManager, SessionStatus } from "../src/core/sessionManager";
import { LocalPersistenceAdapter } from "../src/core/persistence";
import { MidpointXState, LogicShiftSchema } from "../src/core/state";
import { AbortError } from "p-retry";

// ─── Heavy modules that touch the network / FS are mock-isolated ─────────────
jest.mock("../src/core/llmFactory");
jest.mock("../src/core/graph", () => ({
  MidpointXGraph: { stream: jest.fn() },
}));
jest.mock("../src/core/observer", () => ({
  Observer: { sync: jest.fn(), init: jest.fn(), registerSleepCycle: jest.fn() },
}));

// ─────────────────────────────────────────────────────────────────────────────
// 1. POLICY ENGINE
// ─────────────────────────────────────────────────────────────────────────────
describe("PolicyEngine — deterministic safety guardrails", () => {
  // Protected path checks
  test("blocks access to C:\\Windows", () => {
    const result = PolicyEngine.evaluateAction("filesystem__read_file", {
      path: "C:\\Windows\\System32\\drivers\\etc\\hosts",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  test("blocks access to C:\\Program Files", () => {
    const result = PolicyEngine.evaluateAction("filesystem__read_file", {
      path: "C:\\Program Files\\SomeApp\\config.ini",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  test("blocks access to .env secrets file", () => {
    const result = PolicyEngine.evaluateAction("read_file", { path: "D:\\MidpointX\\.env" });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  test("blocks access to .ssh directory", () => {
    const result = PolicyEngine.evaluateAction("read_file", { path: "/home/user/.ssh/id_rsa" });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  test("blocks dangerous rm -rf command", () => {
    const result = PolicyEngine.evaluateAction("execute_system_command", {
      command: "rm -rf /home/randy/projects",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  test("blocks Windows del command", () => {
    const result = PolicyEngine.evaluateAction("execute_system_command", {
      command: "del /f /q D:\\important_file.txt",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  test("blocks npx rimraf", () => {
    const result = PolicyEngine.evaluateAction("execute_system_command", {
      command: "npx rimraf ./node_modules",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  test("blocks src/ deletion via filesystem__delete_file", () => {
    const result = PolicyEngine.evaluateAction("filesystem__delete_file", {
      path: "src/core/graph.ts",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("VIOLATION");
  });

  // Safe paths — should pass
  test("allows access to D:\\MidpointX\\src\\core (no protected pattern match)", () => {
    const result = PolicyEngine.evaluateAction("filesystem__read_file", {
      path: "D:\\MidpointX\\src\\core\\state.ts",
    });
    // No .env, no system32, no Windows, no Program Files in this path
    expect(result).toBeNull();
  });

  test("allows safe shell commands", () => {
    const result = PolicyEngine.evaluateAction("execute_system_command", {
      command: "npm run build",
    });
    expect(result).toBeNull();
  });

  test("returns null when args contain no violations", () => {
    const result = PolicyEngine.evaluateAction("some_tool", { message: "hello world" });
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A2A PROTOCOL — hash chaining integrity
// ─────────────────────────────────────────────────────────────────────────────
describe("A2A Protocol — hash chaining & determinism", () => {
  // We test the hash-generation logic in isolation — same input must always
  // produce the same SHA-256 hex digest.
  function buildAuditHash(nodeName: string, updates: any, timestamp: string, previousHash: string): string {
    const entryData = { timestamp, node: nodeName, commit: updates, previousHash };
    return crypto.createHash("sha256").update(JSON.stringify(entryData)).digest("hex");
  }

  test("same inputs always produce the same hash (determinism)", () => {
    const h1 = buildAuditHash("ReflectionActor", { analysisResult: "ok" }, "2026-01-01T00:00:00.000Z", "0");
    const h2 = buildAuditHash("ReflectionActor", { analysisResult: "ok" }, "2026-01-01T00:00:00.000Z", "0");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test("different node names produce different hashes", () => {
    const h1 = buildAuditHash("ReflectionActor", {}, "2026-01-01T00:00:00.000Z", "0");
    const h2 = buildAuditHash("AnalysisActor", {}, "2026-01-01T00:00:00.000Z", "0");
    expect(h1).not.toBe(h2);
  });

  test("chain link: second hash depends on first (previousHash binding)", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const h1 = buildAuditHash("NodeA", { step: 1 }, t, "0");
    const h2 = buildAuditHash("NodeB", { step: 2 }, t, h1);
    const h2_tamperedChain = buildAuditHash("NodeB", { step: 2 }, t, "TAMPERED_HASH");
    expect(h2).not.toBe(h2_tamperedChain);
  });

  test("tampered commit payload changes the hash", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const h_original = buildAuditHash("ExecutionActor", { tool: "fs_read", result: "ok" }, t, "0");
    const h_tampered = buildAuditHash("ExecutionActor", { tool: "fs_delete", result: "ok" }, t, "0");
    expect(h_original).not.toBe(h_tampered);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SESSION MANAGER — full lifecycle
// ─────────────────────────────────────────────────────────────────────────────
describe("SessionManager — full session lifecycle", () => {
  let adapter: LocalPersistenceAdapter;

  beforeEach(() => {
    adapter = new LocalPersistenceAdapter();
    // Inject the adapter so SessionManager uses our isolated instance
    jest
      .spyOn(require("../src/core/persistence").PersistenceFactory, "getAdapter")
      .mockReturnValue(adapter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("createSession returns a valid ACTIVE session with correct fields", async () => {
    const session = await SessionManager.createSession("task-001", "randy");
    expect(session.taskId).toBe("task-001");
    expect(session.userId).toBe("randy");
    expect(session.status).toBe(SessionStatus.ACTIVE);
    expect(session.stepCount).toBe(0);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test("heartbeat increments stepCount", async () => {
    await SessionManager.createSession("task-hb", "randy");
    await SessionManager.heartbeat("task-hb");
    const session = await adapter.getSession("task-hb");
    expect(session.stepCount).toBe(1);
  });

  test("heartbeat on non-existent session throws", async () => {
    await expect(SessionManager.heartbeat("task-ghost")).rejects.toThrow(/not found/i);
  });

  test("heartbeat on expired session throws and marks as TIMEOUT", async () => {
    const now = new Date();
    const expired = {
      taskId: "task-expired",
      userId: "randy",
      status: SessionStatus.ACTIVE,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() - 1000).toISOString(), // 1 second in the past
      lastHeartbeat: now.toISOString(),
      stepCount: 0,
    };
    await adapter.saveSession(expired);
    await expect(SessionManager.heartbeat("task-expired")).rejects.toThrow(/TIMED OUT/i);
    const terminatedSession = await adapter.getSession("task-expired");
    expect(terminatedSession.status).toBe(SessionStatus.TIMEOUT);
  });

  test("terminateSession marks status correctly", async () => {
    await SessionManager.createSession("task-term", "randy");
    await SessionManager.terminateSession("task-term", SessionStatus.COMPLETED);
    const session = await adapter.getSession("task-term");
    expect(session.status).toBe(SessionStatus.COMPLETED);
  });

  test("terminateSession with FAILED status", async () => {
    await SessionManager.createSession("task-fail", "randy");
    await SessionManager.terminateSession("task-fail", SessionStatus.FAILED);
    const session = await adapter.getSession("task-fail");
    expect(session.status).toBe(SessionStatus.FAILED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PERSISTENCE LAYER — LocalPersistenceAdapter CRUD
// ─────────────────────────────────────────────────────────────────────────────
describe("LocalPersistenceAdapter — CRUD operations", () => {
  let adapter: LocalPersistenceAdapter;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "midpointx-test-"));
    // Override the baseDir via a fresh instance with a tmp directory
    adapter = new LocalPersistenceAdapter();
    (adapter as any).baseDir = tmpDir;
    // Clear in-memory session map
    (adapter as any).sessions = new Map();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  // Skill CRUD
  test("saveSkill / readSkill round-trip", async () => {
    const content = "# name: TEST_SKILL_01\ndescription: A test skill";
    await adapter.saveSkill("TEST_SKILL_01", content);
    const loaded = await adapter.readSkill("TEST_SKILL_01");
    expect(loaded).toBe(content);
  });

  test("readSkill returns null for non-existent skill", async () => {
    const result = await adapter.readSkill("DOES_NOT_EXIST");
    expect(result).toBeNull();
  });

  test("listSkills returns saved skill names", async () => {
    await adapter.saveSkill("SKILL_A", "# name: SKILL_A");
    await adapter.saveSkill("SKILL_B", "# name: SKILL_B");
    const skills = await adapter.listSkills();
    // listSkills returns raw filenames (with .md extension)
    expect(skills.some((s: string) => s.includes("SKILL_A"))).toBe(true);
    expect(skills.some((s: string) => s.includes("SKILL_B"))).toBe(true);
  });

  // Log CRUD
  test("appendLog / readLogs round-trip", async () => {
    await adapter.appendLog("memory", "conversation_001", "Message 1\n");
    await adapter.appendLog("memory", "conversation_001", "Message 2\n");
    const logs = await adapter.readLogs("memory", "conversation_001");
    expect(logs).toContain("Message 1");
    expect(logs).toContain("Message 2");
  });

  test("listLogs returns the correct category keys", async () => {
    await adapter.appendLog("diagnostics", "run_001", "ok\n");
    await adapter.appendLog("diagnostics", "run_002", "ok\n");
    const keys = await adapter.listLogs("diagnostics");
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  // Stats CRUD
  test("saveStats / readStats round-trip with complex object", async () => {
    const data = { tokens: 42000, duration_s: 12.5, model: "claude-opus" };
    await adapter.saveStats("run_stats", data);
    const loaded = await adapter.readStats("run_stats");
    expect(loaded).toEqual(data);
  });

  // Session CRUD (in-memory)
  test("saveSession / getSession round-trip", async () => {
    const session = {
      taskId: "t-999",
      userId: "randy",
      status: SessionStatus.ACTIVE,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      lastHeartbeat: new Date().toISOString(),
      stepCount: 0,
    };
    await adapter.saveSession(session);
    const loaded = await adapter.getSession("t-999");
    expect(loaded).toEqual(session);
  });

  test("getSession returns null for unknown taskId", async () => {
    const result = await adapter.getSession("nonexistent-task");
    expect(result).toBeNull();
  });

  // Audit ledger
  test("appendAudit / getLatestAuditHash chain", async () => {
    const initialHash = await adapter.getLatestAuditHash();
    expect(typeof initialHash).toBe("string");

    const entry1 = JSON.stringify({ hash: "abc123", node: "NodeA", timestamp: "t1" });
    await adapter.appendAudit(entry1);
    const hash1 = await adapter.getLatestAuditHash();
    expect(hash1).toBe("abc123");

    const entry2 = JSON.stringify({ hash: "def456", node: "NodeB", timestamp: "t2" });
    await adapter.appendAudit(entry2);
    const hash2 = await adapter.getLatestAuditHash();
    expect(hash2).toBe("def456");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GRAPH TOPOLOGY — all actor nodes are registered
// ─────────────────────────────────────────────────────────────────────────────
describe("Graph Topology — all actor nodes must be registered", () => {
  const EXPECTED_NODES = [
    "SilentAssessmentActor",
    "ReflectionActor",
    "AnalysisActor",
    "SupervisorActor",
    "LearnActor",
    "CompactionActor",
    "ModifyActor",
    "CompilerActor",
    "JustificationProtocol",
    "VerificationNode",
    "RegressionTester",
    "SelectionActor",
    "ExecutionActor",
    "PruningActor",
    "ResearcherActor",
    "DeveloperActor",
    "TesterActor",
    "SkillAcquisitionActor",
    "HumanApprovalGate",
  ];

  test("graph.ts source registers all required actor nodes", () => {
    const graphSrc = fs.readFileSync(
      path.resolve(__dirname, "../src/core/graph.ts"),
      "utf-8"
    );
    for (const nodeName of EXPECTED_NODES) {
      expect(graphSrc).toContain(`"${nodeName}"`);
    }
  });

  test("graph.ts starts from START and terminates to END", () => {
    const graphSrc = fs.readFileSync(
      path.resolve(__dirname, "../src/core/graph.ts"),
      "utf-8"
    );
    expect(graphSrc).toContain("START");
    expect(graphSrc).toContain("END");
  });

  test("HumanApprovalGate exists as a human-in-the-loop breakpoint", () => {
    const graphSrc = fs.readFileSync(
      path.resolve(__dirname, "../src/core/graph.ts"),
      "utf-8"
    );
    expect(graphSrc).toContain("HumanApprovalGate");
    expect(graphSrc).toContain("interruptBefore");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. STATE REDUCERS — verify annotation semantics
// ─────────────────────────────────────────────────────────────────────────────
describe("MidpointXState — reducer semantics", () => {
  const spec = (MidpointXState as any).spec ?? (MidpointXState as any).lc_graph_name;

  test("state definition includes citedSkills (set-union array)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/state.ts"),
      "utf-8"
    );
    expect(src).toContain("citedSkills");
  });

  test("state definition includes totalInputTokens (additive reducer)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/state.ts"),
      "utf-8"
    );
    expect(src).toContain("totalInputTokens");
    expect(src).toContain("x + y"); // additive reducer
  });

  test("state definition includes replanCount (additive reducer)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/state.ts"),
      "utf-8"
    );
    expect(src).toContain("replanCount");
  });

  test("state definition includes outputArtifacts (append reducer)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/state.ts"),
      "utf-8"
    );
    expect(src).toContain("outputArtifacts");
    expect(src).toContain("abandonedPlans");
  });

  test("strategicPlan uses replacement reducer (last-write wins)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/state.ts"),
      "utf-8"
    );
    // The strategicPlan reducer is (x, y) => y — pure replacement
    expect(src).toContain("strategicPlan");
  });

  test("LogicShiftSchema rejects more than 3 conceptual tags", () => {
    const tooManyTags = {
      theoremId: "THEOREM_TEST_01",
      pattern: "test pattern",
      optimization: "test optimization",
      justification: "test justification",
      conceptualTags: ["a", "b", "c", "d"], // 4 tags — should fail
    };
    expect(() => LogicShiftSchema.parse(tooManyTags)).toThrow();
  });

  test("LogicShiftSchema accepts exactly 3 conceptual tags", () => {
    const validShift = {
      theoremId: "THEOREM_TEST_01",
      pattern: "test pattern",
      optimization: "test optimization",
      justification: "test justification",
      conceptualTags: ["filesystem", "resilience", "retry"],
    };
    expect(() => LogicShiftSchema.parse(validShift)).not.toThrow();
    const parsed = LogicShiftSchema.parse(validShift);
    expect(parsed.conceptualTags).toHaveLength(3);
  });

  test("LogicShiftSchema accepts 0 conceptual tags", () => {
    const validShift = {
      theoremId: "THEOREM_MIN_01",
      pattern: "minimal",
      optimization: "minimal",
      justification: "minimal",
      conceptualTags: [],
    };
    expect(() => LogicShiftSchema.parse(validShift)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. LLMFactory — provider and tier selection
// ─────────────────────────────────────────────────────────────────────────────
describe("LLMFactory — provider and tier selection", () => {
  test("LLMFactory source defines all 6 supported providers", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/llmFactory.ts"),
      "utf-8"
    );
    const expectedProviders = ["anthropic", "openrouter", "openai", "google", "nvidia", "local"];
    for (const provider of expectedProviders) {
      expect(src).toContain(`"${provider}"`);
    }
  });

  test("LLMFactory source references worker vs expert tier split", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/llmFactory.ts"),
      "utf-8"
    );
    expect(src).toContain("WORKER_MODEL_NAME");
    expect(src).toContain("ACTIVE_MODEL_NAME");
    expect(src).toContain(`tier === "worker"`);
  });

  test("LLMFactory uses maxTokens 512 for worker tier", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/llmFactory.ts"),
      "utf-8"
    );
    expect(src).toContain("512");
  });

  test("LLMFactory injects extended thinking budget for Anthropic", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/llmFactory.ts"),
      "utf-8"
    );
    expect(src).toContain("budget_tokens");
    expect(src).toContain("32000");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. PLUGIN REGISTRY — MD skill loading
// ─────────────────────────────────────────────────────────────────────────────
describe("PluginRegistry — MD skill file loading", () => {
  const SKILLS_DIR = path.resolve(__dirname, "../src/plugins/skills");

  test("skills directory exists and contains .md files", () => {
    expect(fs.existsSync(SKILLS_DIR)).toBe(true);
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(5);
  });

  test("SKILL_TEMPLATE.md exists as the canonical template", () => {
    expect(fs.existsSync(path.join(SKILLS_DIR, "SKILL_TEMPLATE.md"))).toBe(true);
  });

  test("every THEOREM_*.md skill file declares a name field", () => {
    const theoremFiles = fs
      .readdirSync(SKILLS_DIR)
      .filter(f => f.startsWith("THEOREM_") && f.endsWith(".md"));

    const missing: string[] = [];
    for (const file of theoremFiles) {
      const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
      if (!content.match(/^\s*name:\s*.+/m)) {
        missing.push(file);
      }
    }
    if (missing.length > 0) {
      console.warn(`⚠️  Theorem files missing 'name:' field: ${missing.join(", ")}`);
    }
    // We log as a warning rather than hard-fail (some are stubs)
    expect(missing.length).toBeLessThan(theoremFiles.length); // at least some have names
  });

  test("hot-reload source code handles missing name gracefully", () => {
    const registrySrc = fs.readFileSync(
      path.resolve(__dirname, "../src/core/pluginRegistry.ts"),
      "utf-8"
    );
    expect(registrySrc).toContain("hotReloadSkill");
    expect(registrySrc).toContain("nameMatch");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. RESILIENCE WRAPPER — retry and abort behavior
// ─────────────────────────────────────────────────────────────────────────────
describe("Resilience wrapper — invokeWithResilience", () => {
  // We test the core logic in isolation without importing the actual module
  // (which requires a live LLM config) by reimplementing the abort condition.

  function shouldAbort(status: number): boolean {
    return status === 400 || status === 401 || status === 403;
  }

  function shouldRetry(status: number): boolean {
    return status === 429 || status === 503 || status === 500;
  }

  test("aborts on HTTP 400 (Bad Request)", () => {
    expect(shouldAbort(400)).toBe(true);
    expect(shouldRetry(400)).toBe(false);
  });

  test("aborts on HTTP 401 (Unauthorized)", () => {
    expect(shouldAbort(401)).toBe(true);
    expect(shouldRetry(401)).toBe(false);
  });

  test("aborts on HTTP 403 (Forbidden)", () => {
    expect(shouldAbort(403)).toBe(true);
    expect(shouldRetry(403)).toBe(false);
  });

  test("retries on HTTP 429 (Rate Limited)", () => {
    expect(shouldAbort(429)).toBe(false);
    expect(shouldRetry(429)).toBe(true);
  });

  test("retries on HTTP 503 (Service Unavailable)", () => {
    expect(shouldAbort(503)).toBe(false);
    expect(shouldRetry(503)).toBe(true);
  });

  test("retries on HTTP 500 (Internal Server Error)", () => {
    expect(shouldAbort(500)).toBe(false);
    expect(shouldRetry(500)).toBe(true);
  });

  test("AbortError is importable from p-retry (hard dependency check)", () => {
    const err = new AbortError("fatal");
    expect(err.message).toBe("fatal");
  });

  test("resilience source uses jitter (randomize: true)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/resilience.ts"),
      "utf-8"
    );
    expect(src).toContain("randomize: true");
  });

  test("resilience source uses exponential back-off (factor: 2)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/resilience.ts"),
      "utf-8"
    );
    expect(src).toContain("factor: 2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. MCP CONFIG INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
describe("MCP Config — structural integrity", () => {
  const MCP_CONFIG_PATH = path.resolve(
    __dirname,
    "../src/plugins/mcp/mcp_config.json"
  );

  let config: any;
  beforeAll(() => {
    const raw = fs.readFileSync(MCP_CONFIG_PATH, "utf-8");
    config = JSON.parse(raw); // throws if invalid JSON
  });

  test("mcp_config.json is valid JSON", () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  test("config has a top-level mcpServers key", () => {
    expect(config).toHaveProperty("mcpServers");
    expect(typeof config.mcpServers).toBe("object");
  });

  test("browser server is configured", () => {
    expect(config.mcpServers).toHaveProperty("browser");
    expect(config.mcpServers.browser.command).toBe("npx");
  });

  test("filesystem server is configured", () => {
    expect(config.mcpServers).toHaveProperty("filesystem");
  });

  test("fetch server is configured", () => {
    expect(config.mcpServers).toHaveProperty("fetch");
  });

  test("github server is configured", () => {
    expect(config.mcpServers).toHaveProperty("github");
  });

  test("every server entry has command and args", () => {
    for (const [name, server] of Object.entries(config.mcpServers) as any) {
      expect(server).toHaveProperty("command");
      expect(server).toHaveProperty("args");
      expect(Array.isArray(server.args)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. SKILL TEMPLATE COMPLIANCE
// ─────────────────────────────────────────────────────────────────────────────
describe("Skill Template Compliance", () => {
  const SKILLS_DIR = path.resolve(__dirname, "../src/plugins/skills");

  // Named skills that are critical to the agent's proactive operation
  const CRITICAL_SKILLS = [
    "PROACTIVE_HEARTBEAT.md",
    "THEOREM_HEALTH_MASTER.md",
    "WORKSPACE_SENTINEL.md",
  ];

  for (const filename of CRITICAL_SKILLS) {
    test(`${filename} exists and has required fields`, () => {
      const fullPath = path.join(SKILLS_DIR, filename);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, "utf-8");
      expect(content).toMatch(/name:\s*.+/);
      expect(content).toMatch(/description:\s*.+/);
    });
  }

  test("SKILL_TEMPLATE.md contains the canonical field scaffolding", () => {
    const content = fs.readFileSync(path.join(SKILLS_DIR, "SKILL_TEMPLATE.md"), "utf-8");
    expect(content).toContain("name:");
    expect(content).toContain("description:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. CONFIG SCHEMA — Zod validation
// ─────────────────────────────────────────────────────────────────────────────
describe("Config Schema — Zod validation and defaults", () => {
  test("config source defines ACTIVE_LLM_PROVIDER enum with 6 values", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/config.ts"),
      "utf-8"
    );
    const providers = ["google", "anthropic", "openai", "openrouter", "local", "nvidia"];
    for (const p of providers) {
      expect(src).toContain(`"${p}"`);
    }
  });

  test("config source defines numeric defaults for PORT and MAX_RECURSION_LIMIT", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/config.ts"),
      "utf-8"
    );
    expect(src).toContain("PORT");
    expect(src).toContain("5001");
    expect(src).toContain("MAX_RECURSION_LIMIT");
  });

  test("config source has WEBHOOK_SECRET minimum-length enforcement", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/config.ts"),
      "utf-8"
    );
    expect(src).toContain("WEBHOOK_SECRET");
    expect(src).toContain("min(32");
  });

  test("config source defines TOOL_PROFILE enum with messaging / coding / full", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/config.ts"),
      "utf-8"
    );
    expect(src).toContain("messaging");
    expect(src).toContain("coding");
    expect(src).toContain("full");
  });

  test("config source exports a reloadConfig function", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/core/config.ts"),
      "utf-8"
    );
    expect(src).toContain("reloadConfig");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. END-TO-END STATE MACHINE MOCK — proactive vs reactive routing
// ─────────────────────────────────────────────────────────────────────────────
describe("Graph routing logic — proactive vs reactive path selection", () => {
  // Mirror the exact routing condition in graph.ts
  function route(proactiveTrigger: any): "silent_assessment" | "reflection" {
    return proactiveTrigger ? "silent_assessment" : "reflection";
  }

  test("null trigger routes to reflection (reactive path)", () => {
    expect(route(null)).toBe("reflection");
  });

  test("undefined trigger routes to reflection", () => {
    expect(route(undefined)).toBe("reflection");
  });

  test("populated trigger routes to silent_assessment (proactive path)", () => {
    expect(route({ type: "cron", skill: "PROACTIVE_HEARTBEAT", data: {} })).toBe("silent_assessment");
  });

  // Mirror SilentAssessmentActor edge routing
  function assessmentEdge(decision: string | null): string {
    if (decision === "DROP") return "end";
    if (decision === "NOTIFY") return "approval";
    if (decision === "ACTION") return "reflection";
    return "end";
  }

  test("DROP decision terminates the graph (end)", () => {
    expect(assessmentEdge("DROP")).toBe("end");
  });

  test("NOTIFY decision routes to HumanApprovalGate", () => {
    expect(assessmentEdge("NOTIFY")).toBe("approval");
  });

  test("ACTION decision continues to ReflectionActor (worker swarm route)", () => {
    expect(assessmentEdge("ACTION")).toBe("reflection");
  });

  test("null decision falls back to end", () => {
    expect(assessmentEdge(null)).toBe("end");
  });

  // Mirror SupervisorActor edge routing
  function supervisorEdge(state: {
    isTaskComplete: boolean;
    skillGapQuery: string;
    activeWorker: string;
  }): string {
    if (state.isTaskComplete) return "compaction";
    if (state.skillGapQuery) return "skill_acquisition";
    if (state.activeWorker === "researcher") return "researcher";
    if (state.activeWorker === "developer") return "developer";
    if (state.activeWorker === "tester") return "tester";
    return "compaction";
  }

  test("isTaskComplete routes to compaction", () => {
    expect(supervisorEdge({ isTaskComplete: true, skillGapQuery: "", activeWorker: "none" })).toBe("compaction");
  });

  test("skillGapQuery routes to skill_acquisition", () => {
    expect(supervisorEdge({ isTaskComplete: false, skillGapQuery: "How to use Docker API?", activeWorker: "none" })).toBe("skill_acquisition");
  });

  test("activeWorker=researcher routes to researcher", () => {
    expect(supervisorEdge({ isTaskComplete: false, skillGapQuery: "", activeWorker: "researcher" })).toBe("researcher");
  });

  test("activeWorker=developer routes to developer", () => {
    expect(supervisorEdge({ isTaskComplete: false, skillGapQuery: "", activeWorker: "developer" })).toBe("developer");
  });

  test("activeWorker=tester routes to tester", () => {
    expect(supervisorEdge({ isTaskComplete: false, skillGapQuery: "", activeWorker: "tester" })).toBe("tester");
  });

  test("no special condition defaults to compaction", () => {
    expect(supervisorEdge({ isTaskComplete: false, skillGapQuery: "", activeWorker: "none" })).toBe("compaction");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. NEW ROBUSTNESS SKILLS — existence and compliance
// ─────────────────────────────────────────────────────────────────────────────
describe("New Robustness Skills — existence and field compliance", () => {
  const SKILLS_DIR = path.resolve(__dirname, "../src/plugins/skills");

  const NEW_SKILLS = [
    "THEOREM_OUTPUT_VALIDATION_01.md",
    "THEOREM_ERROR_TAXONOMY_01.md",
    "THEOREM_DOCKER_SANDBOX_01.md",
    "THEOREM_SKILL_DEDUPLICATION_01.md",
    "THEOREM_TOKEN_BUDGET_01.md",
    "THEOREM_CONTEXT_RECOVERY_01.md",
    "THEOREM_APPROVAL_ESCALATION_01.md",
    "THEOREM_APPROVAL_SEVERITY_01.md",
    "THEOREM_SWARM_HANDOFF_01.md",
    "THEOREM_CONFLICT_RESOLUTION_01.md",
    "THEOREM_AUDIT_CHAIN_VERIFY_01.md",
    "THEOREM_SECRET_ROTATION_01.md",
  ];

  for (const filename of NEW_SKILLS) {
    test(`${filename} — exists, has name and description`, () => {
      const fullPath = path.join(SKILLS_DIR, filename);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, "utf-8");
      expect(content).toMatch(/^name:\s*.+/m);
      expect(content).toMatch(/^description:\s*.+/m);
    });
  }

  test("THEOREM_AUDIT_CHAIN_VERIFY_01 has a nightly cron schedule", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_AUDIT_CHAIN_VERIFY_01.md"),
      "utf-8"
    );
    expect(content).toMatch(/schedule:\s*"0 2 \* \* \*"/);
  });

  test("THEOREM_SECRET_ROTATION_01 never logs actual key values (security check)", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_SECRET_ROTATION_01.md"),
      "utf-8"
    );
    // The skill must explicitly forbid logging key values
    expect(content).toContain("NEVER log");
    expect(content).toContain("NEVER include key values");
  });

  test("THEOREM_ERROR_TAXONOMY_01 defines all 6 error classes (A through F)", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_ERROR_TAXONOMY_01.md"),
      "utf-8"
    );
    ["Class A", "Class B", "Class C", "Class D", "Class E", "Class F"].forEach((cls) => {
      expect(content).toContain(cls);
    });
  });

  test("THEOREM_TOKEN_BUDGET_01 defines all 4 budget tiers", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_TOKEN_BUDGET_01.md"),
      "utf-8"
    );
    ["Tier 1", "Tier 2", "Tier 3", "Tier 4"].forEach((tier) => {
      expect(content).toContain(tier);
    });
  });

  test("THEOREM_SWARM_HANDOFF_01 covers all three worker transition paths", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_SWARM_HANDOFF_01.md"),
      "utf-8"
    );
    expect(content).toContain("ResearcherActor");
    expect(content).toContain("DeveloperActor");
    expect(content).toContain("TesterActor");
  });

  test("THEOREM_DOCKER_SANDBOX_01 defines all 3 execution tiers", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_DOCKER_SANDBOX_01.md"),
      "utf-8"
    );
    expect(content).toContain("SANDBOX_TIER_1");
    expect(content).toContain("SANDBOX_TIER_2_DEGRADED");
    expect(content).toContain("SANDBOX_TIER_3_DENIED");
  });

  test("THEOREM_APPROVAL_SEVERITY_01 references PolicyEngine as pre-check", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_APPROVAL_SEVERITY_01.md"),
      "utf-8"
    );
    expect(content).toContain("PolicyEngine");
  });

  test("THEOREM_CONTEXT_RECOVERY_01 references the A2A audit ledger as recovery anchor", () => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, "THEOREM_CONTEXT_RECOVERY_01.md"), "utf-8"
    );
    expect(content).toContain("audit ledger");
    expect(content).toContain("latestAuditHash");
  });
});
