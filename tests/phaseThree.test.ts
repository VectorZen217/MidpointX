import crypto from "crypto";
import fs from "fs";
import path from "path";
import { A2AService, SafetyCertificate } from "../src/services/a2aService";
import { MemoryManager } from "../src/core/memory";
import { Observer } from "../src/core/observer";
import { BrowserSerializer } from "../src/plugins/browser/BrowserSerializer";

describe("Phase III: Sovereign Interoperability & Sleep-Cycle Auto-Skills Suite", () => {
  
  // 🔐 1. Ed25519 Cryptographic Verification
  test("A2AService should verify authentic Ed25519 signatures and reject tampered payloads", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();

    const payload = "Compile NexusTrader in sandboxed mode";
    const signature = crypto.sign(undefined, Buffer.from(payload), privateKey).toString("hex");

    // Valid check
    const isAuthentic = A2AService.verifyPayloadSignature(publicKeyPem, signature, payload);
    expect(isAuthentic).toBe(true);

    // Tampered payload check
    const isAuthenticTampered = A2AService.verifyPayloadSignature(publicKeyPem, signature, payload + " and delete all files");
    expect(isAuthenticTampered).toBe(false);

    // Mismatched signature check
    const wrongSignature = crypto.sign(undefined, Buffer.from("Something else"), privateKey).toString("hex");
    const isAuthenticWrong = A2AService.verifyPayloadSignature(publicKeyPem, wrongSignature, payload);
    expect(isAuthenticWrong).toBe(false);
  });

  // 🛡️ 2. Path Scoping & Tool Permission Restrictions
  test("A2AService should validate path and tool scopes according to SafetyCertificate boundaries", () => {
    const cert: SafetyCertificate = {
      agentId: "nexus_trader_connector",
      alignmentProof: "sha256_mock_hash",
      refusalThreshold: 0.1,
      capabilities: ["disciplined_refusal"],
      allowedPaths: ["D:\\playground\\NexusTrader", "d:\\MidpointX\\src"],
      allowedTools: ["compilerNode", "run_command", "desktop__take_snapshot"]
    };

    // Path Allowed Checks
    expect(A2AService.validateRequestScope(cert, "D:\\playground\\NexusTrader\\src\\index.ts", undefined)).toBe(true);
    expect(A2AService.validateRequestScope(cert, "d:\\MidpointX\\src\\core\\persistence.ts", undefined)).toBe(true);

    // Path Violation Checks
    expect(A2AService.validateRequestScope(cert, "C:\\Windows\\System32\\cmd.exe", undefined)).toBe(false);
    expect(A2AService.validateRequestScope(cert, "D:\\another_playground\\SomeSecret", undefined)).toBe(false);

    // Tool Allowed Checks
    expect(A2AService.validateRequestScope(cert, undefined, "compilerNode")).toBe(true);
    expect(A2AService.validateRequestScope(cert, undefined, "run_command")).toBe(true);

    // Tool Violation Checks
    expect(A2AService.validateRequestScope(cert, undefined, "filesystem__delete_file")).toBe(false);
    expect(A2AService.validateRequestScope(cert, undefined, "mcp_GitKraken_git_push")).toBe(false);
  });

  // 🛰️ 3. Unsupervised Sleep-Cycle Habit Mining & Skill Synthesis
  test("Sleep Cycle should cluster repetitive user activities and generate custom auto-skill theorems", async () => {
    const appName = "LiveNexusTraderSandbox";
    const windowTitle = "NexusTrader Engine Dashboard";
    
    // Clear and mock repetitive habit logs
    const habitsPath = path.join(process.cwd(), "src", "plugins", "skills", "habits.json");
    if (fs.existsSync(habitsPath)) {
      fs.unlinkSync(habitsPath);
    }

    // Append 5 habit records to cross the mining threshold
    for (let i = 0; i < 5; i++) {
      await MemoryManager.logHabitData(appName, windowTitle);
    }

    const currentHabits = await MemoryManager.getHabitData();
    console.log("DEBUG HABITS IN TEST:", JSON.stringify(currentHabits));

    // Run the background sleep cycle maintenance pipeline
    await Observer.executeSleepCycle();

    // Verify that the auto-skill file was generated in the skills directory
    const expectedSkillSlug = `auto-skill-${appName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const skillFilePath = path.join(process.cwd(), "src", "plugins", "skills", `${expectedSkillSlug}.md`);

    expect(fs.existsSync(skillFilePath)).toBe(true);
    
    const skillContent = fs.readFileSync(skillFilePath, "utf8");
    expect(skillContent).toContain(`name: AUTO_SKILL_${appName.toUpperCase()}`);
    expect(skillContent).toContain(`description: Mined automation skill for highly repeated workflow in ${appName}`);
    expect(skillContent).toContain(windowTitle);

    // Cleanup synthesized test skill
    fs.unlinkSync(skillFilePath);
  });

  // 🌐 4. Stateful Browser Serialization & Rehydration
  test("BrowserSerializer should serialize Puppeteer cookies, storage, DOM, and rehydrate state", async () => {
    const taskId = "jest-test-session";
    const mockUrl = "https://polymarket.com/dashboard";
    const mockCookies = [
      { name: "auth_token", value: "abcdef12345", domain: "polymarket.com" }
    ];
    
    // Mock page with session variables
    const mockPage = {
      url: () => mockUrl,
      cookies: async () => mockCookies,
      evaluate: async (fn: any) => {
        return {
          local: JSON.stringify({ theme: "dark_cyber" }),
          session: JSON.stringify({ current_tab: "markets" })
        };
      },
      content: async () => "<html><body>Polymarket Live Portal</body></html>"
    };

    // Serialize
    const filepath = await BrowserSerializer.serializeSession(mockPage, taskId);
    expect(fs.existsSync(filepath)).toBe(true);

    const serializedState = JSON.parse(fs.readFileSync(filepath, "utf8"));
    expect(serializedState.url).toBe(mockUrl);
    expect(serializedState.cookies[0].name).toBe("auth_token");
    expect(serializedState.localStorage).toContain("theme");

    // Mock browser and rehydration page checks
    const targetPage = {
      setCookie: jest.fn(),
      goto: jest.fn().mockResolvedValue(null),
      evaluate: jest.fn().mockResolvedValue(null),
      reload: jest.fn().mockResolvedValue(null)
    };

    const mockBrowser = {
      newPage: async () => targetPage
    };

    const rehydratedPage = await BrowserSerializer.rehydrateSession(mockBrowser, taskId);
    expect(rehydratedPage).toBe(targetPage);
    expect(targetPage.setCookie).toHaveBeenCalledWith(mockCookies[0]);
    expect(targetPage.goto).toHaveBeenCalledWith(mockUrl, expect.any(Object));

    // Cleanup session file
    fs.unlinkSync(filepath);
  });
});
