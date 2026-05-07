import fs from "fs/promises";
import path from "path";

const WORKSPACE_DIR = path.resolve(__dirname, "../../src/workspace");

/**
 * WorkspaceLoader — reads AGENT.md and USER.md at boot and caches them.
 * These files act as "firmware" injected into every system prompt.
 */
export class WorkspaceLoader {
  private static agentPersona: string = "";
  private static userContext: string = "";
  private static initialized = false;

  static async init(): Promise<void> {
    await this.reload();
    this.initialized = true;
  }

  static async reload(): Promise<void> {
    try {
      const agentPath = path.join(WORKSPACE_DIR, "AGENT.md");
      this.agentPersona = await fs.readFile(agentPath, "utf-8");
      console.log(`✅ [WorkspaceLoader] AGENT.md loaded (${this.agentPersona.length} chars)`);
    } catch {
      console.warn("⚠️ [WorkspaceLoader] AGENT.md not found. Using defaults.");
      this.agentPersona = "You are MidpointX, an autonomous AI assistant.";
    }

    try {
      const userPath = path.join(WORKSPACE_DIR, "USER.md");
      this.userContext = await fs.readFile(userPath, "utf-8");
      console.log(`✅ [WorkspaceLoader] USER.md loaded (${this.userContext.length} chars)`);
    } catch {
      console.warn("⚠️ [WorkspaceLoader] USER.md not found. No user context loaded.");
      this.userContext = "";
    }
  }

  static getAgentPersona(): string {
    return this.agentPersona;
  }

  static getUserContext(): string {
    return this.userContext;
  }

  /**
   * Returns the combined identity block for use in system prompts.
   */
  static buildSystemContext(): string {
    const parts: string[] = [];
    if (this.agentPersona) parts.push(`## AGENT PERSONA\n${this.agentPersona}`);
    if (this.userContext) parts.push(`## USER PROFILE\n${this.userContext}`);
    return parts.join("\n\n---\n\n");
  }

  /**
   * Read both files raw (for the API endpoint to serve to the UI).
   */
  static async getRaw(): Promise<{ agent: string; user: string }> {
    return {
      agent: this.agentPersona,
      user: this.userContext,
    };
  }

  /**
   * Write updated content back to disk and reload cache.
   */
  static async saveAndReload(type: "agent" | "user", content: string): Promise<void> {
    const filename = type === "agent" ? "AGENT.md" : "USER.md";
    const filePath = path.join(WORKSPACE_DIR, filename);
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`💾 [WorkspaceLoader] ${filename} updated. Reloading...`);
    await this.reload();
  }
}
