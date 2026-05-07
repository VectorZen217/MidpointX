import { FunctionDeclaration, Type } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs/promises";
import path from "path";
import { Scheduler } from "./scheduler";
const PROJECT_ROOT = path.resolve(__dirname, "../../");

export interface MDSkill {
  name: string;
  description: string;
  content: string;
  filePath?: string;
  schedule?: string; // Cron expression for proactive tasks
}

export class PluginRegistry {
  private static mdSkills: Map<string, MDSkill> = new Map();
  private static mcpClients: Map<string, Client> = new Map();
  private static activeTools: FunctionDeclaration[] = [];

  static async init() {
    console.log("🧩 [PluginRegistry] Initialization Framework...");
    await this.initMDSkills();
    await this.initMCPServers();
    await this.rebuildToolsArray();
    
    // We don't call Scheduler.init() here because server.ts needs to pass 'io'
  }

  public static getMDSkills(): MDSkill[] {
    return Array.from(this.mdSkills.values());
  }

  public static async reloadMDSkills() {
    console.log("🧩 [PluginRegistry] Hot-reloading MD Skills...");
    this.mdSkills.clear();
    await this.initMDSkills();
    await this.rebuildToolsArray();
    await Scheduler.sync(); // Keep the heartbeat in sync
  }

  private static async initMDSkills() {
    try {
      const skillsDir = path.resolve(__dirname, "../../src/plugins/skills");
      try {
        await fs.access(skillsDir);
      } catch {
        console.warn("⚠️ [PluginRegistry] MD skills directory not found at:", skillsDir);
        return;
      }

      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      
      await Promise.all(entries.map(async (entry) => {
        let filePath: string | null = null;
        let content: string | null = null;

        if (entry.isFile() && entry.name.endsWith(".md")) {
          filePath = path.join(skillsDir, entry.name);
        } else if (entry.isDirectory()) {
          const skillMDPath = path.join(skillsDir, entry.name, "SKILL.md");
          try {
            await fs.access(skillMDPath);
            filePath = skillMDPath;
          } catch {
            // No SKILL.md in this folder, skip
          }
        }

        if (filePath) {
          content = await fs.readFile(filePath, "utf-8");
          const nameMatch = content.match(/name:\s*(.+)/);
          const descMatch = content.match(/description:\s*(.+)/);
          const scheduleMatch = content.match(/schedule:\s*["']?([^"'\s][^"']*)["']?/);
          
          if (nameMatch) {
            const skillName = nameMatch[1].trim();
            this.mdSkills.set(skillName, {
              name: skillName,
              description: descMatch ? descMatch[1].trim() : "Custom Agent Skill",
              content: content,
              filePath: filePath,
              schedule: scheduleMatch ? scheduleMatch[1].trim() : undefined
            });
            console.log(`✅ [PluginRegistry] Loaded MD Skill: ${skillName} (${entry.isDirectory() ? 'DIR' : 'FILE'})${scheduleMatch ? ' [SCHEDULED]' : ''}`);
          }
        }
      }));
    } catch (e: any) {
      console.warn("⚠️ [PluginRegistry] Failing to read skills:", e.message);
    }
  }

  private static async initMCPServers() {
    try {
      const configPath = path.resolve(__dirname, "../../src/plugins/mcp/mcp_config.json");
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);

      if (!config.mcpServers) return;

      const connectionPromises = Object.entries<any>(config.mcpServers).map(async ([serverName, serverConfig]) => {
        // Skip browser - we will lazy-load this per user in routeAndExecute
        if (serverName === "browser") {
          console.log(`ℹ️ [PluginRegistry] Registering ${serverName} as dynamic user-isolated server.`);
          return;
        }

        // Check for placeholder tokens
        const envEntries = Object.entries(serverConfig.env || {});
        const hasPlaceholder = envEntries.some(([_k, v]) => String(v).includes("INSERT_YOUR") || String(v).length === 0);
        
        if (hasPlaceholder) {
            console.warn(`⏩ [PluginRegistry] Skipping ${serverName}: Missing or placeholder API tokens.`);
            return;
        }

        try {
          const resolvedArgs = serverConfig.args?.map((arg: string) => this.resolvePath(arg));
          const resolvedEnv = Object.fromEntries(
            Object.entries(serverConfig.env || {}).map(([k, v]) => [k, this.resolvePath(v as string)])
          );

          console.log(`🔌 [PluginRegistry] Attempting connection to global MCP server: ${serverName}`);

          const transport = new StdioClientTransport({
            command: serverConfig.command,
            args: resolvedArgs || serverConfig.args,
            env: { ...process.env, ...resolvedEnv }
          });

          const client = new Client(
            { name: "MidpointX", version: "2.0.0" },
            { capabilities: {} }
          );

          // Connect with timeout to prevent whole-system hang
          await Promise.race([
            client.connect(transport),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 15000))
          ]);

          this.mcpClients.set(serverName, client); // Global instance
          console.log(`✅ [PluginRegistry] Connected to global MCP server: ${serverName}`);
        } catch (serverErr: any) {
          console.error(`❌ [PluginRegistry] Failed to connect to MCP server "${serverName}":`, serverErr.message);
        }
      });

      await Promise.allSettled(connectionPromises);
    } catch (e: any) {
      console.warn("⚠️ [PluginRegistry] Global MCP Manifest Error:", e.message);
    }
  }

  private static async rebuildToolsArray() {
    const rawTools: FunctionDeclaration[] = [];

    // The unified tool to read any MD skill
    // (Legacy read_skill removed. Now using system__read_skill registered below)

    // Add MCP tools (from config, even for lazy ones)
    const configPath = path.join(__dirname, "../../src/plugins/mcp/mcp_config.json");
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    for (const [serverName, client] of this.mcpClients.entries()) {
      try {
        const result = await client.listTools();
        for (const tool of result.tools) {
           rawTools.push({
             name: `${serverName}__${tool.name}`,
             description: tool.description || `Tool ${tool.name} from ${serverName}`,
             parameters: tool.inputSchema as any
           });
        }
      } catch (err) {
        console.error(`Failed to fetch tools from global ${serverName}`, err);
      }
    }

    // Special handling for browser - since it's lazy, we fetch its tool schema once from a temp instance or just use standard puppeteer tool set
    // For simplicity, if browser config is present, we assume standard puppeteer tools are available if the server is @modelcontextprotocol/server-puppeteer
    if (config.mcpServers && config.mcpServers.browser) {
        // We add hardcoded standard browser tools if they aren't already listed
        const browserToolSchemas: Record<string, any> = {
          "navigate": { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
          "screenshot": { type: "object", properties: { name: { type: "string" } } },
          "click": { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] },
          "type": { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"] },
          "fill": { type: "object", properties: { selector: { type: "string" }, value: { type: "string" } }, required: ["selector", "value"] },
          "hover": { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] },
          "wait_for_selector": { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] },
          "evaluate": { type: "object", properties: { script: { type: "string" } }, required: ["script"] }
        };

        const browserTools = ["navigate", "screenshot", "click", "hover", "type", "evaluate", "fill", "select_option", "drag_and_drop", "wait_for_selector"];
        browserTools.forEach(bt => {
             rawTools.push({
                name: `browser__${bt}`,
                description: `Browser ${bt} operation (User Isolated)`,
                parameters: browserToolSchemas[bt] || { type: "object", properties: {} } as any 
             });
        });
    }

    // Natively inject our new OpenClaw desktop and filesystem tools
    console.log("🛠️ [PluginRegistry] Injecting OpenClaw desktop and filesystem tools...");
    const builtinFS = ["list_directory", "read_text_file", "write_text_file", "search_files", "delete_file"];
    builtinFS.forEach(fsTool => {
       const toolName = `filesystem__${fsTool}`;
       if (rawTools.some(t => t.name === toolName)) return;
       rawTools.push({
         name: toolName,
         description: `Cross-platform native filesystem operation: ${fsTool}`,
         parameters: {
             type: "object", properties: { path: { type: "string" }, content: { type: "string" }, pattern: { type: "string" } }
         } as any
       });
    });

    const builtinDesktop = ["mouse_move", "mouse_click", "keyboard_type", "keyboard_press", "scan_screen", "find_element", "take_snapshot", "review_history"];
    const builtinMessaging = ["send_telegram"];
    builtinDesktop.forEach(deskTool => {
       const toolName = `desktop__${deskTool}`;
       if (rawTools.some(t => t.name === toolName)) return;
       rawTools.push({
         name: toolName,
         description: `Native OS automation operation: ${deskTool}`,
         parameters: {
             type: "object", properties: { x: { type: "number" }, y: { type: "number" }, text: { type: "string" }, key: { type: "string" }, clickType: { type: "string" }, query: { type: "string" } }
         } as any
       });
    });

    builtinMessaging.forEach(msgTool => {
       const toolName = `messaging__${msgTool}`;
       if (rawTools.some(t => t.name === toolName)) return;
       rawTools.push({
         name: toolName,
         description: `Proactive messaging operation: ${msgTool}`,
         parameters: {
             type: "object", properties: { text: { type: "string" }, userId: { type: "string" } }, required: ["text"]
         } as any
       });
    });

    rawTools.push({
      name: "system__request_replanning",
      description: "Abort the current strategic plan and request a new analysis. REQUIRED: You must provide a 'thesis' explaining exactly why the previous plan failed and what new insight forces this pivot.",
      parameters: {
          type: "object", properties: { thesis: { type: "string" } }, required: ["thesis"]
      } as any
    });

    rawTools.push({
      name: "system__read_skill",
      description: "Read the full technical content of an existing theorem/skill.",
      parameters: { type: "object", properties: { skillName: { type: "string" } } } as any
    });

    rawTools.push({
      name: "system__update_skill",
      description: "Update or refine an existing theorem/skill with improved logic.",
      parameters: { type: "object", properties: { skillName: { type: "string" }, newContent: { type: "string" } } } as any
    });

    this.activeTools = rawTools;
  }

  public static getActiveTools(): FunctionDeclaration[] {
    return this.activeTools;
  }

  /**
   * Gracefully shuts down all active MCP clients.
   * Prevents noisy tracebacks from child processes on exit.
   */
  public static async shutdown() {
    console.log("🧩 [PluginRegistry] Shutting down active MCP connections...");
    for (const [name, client] of this.mcpClients.entries()) {
      try {
        // Use a timeout to avoid hanging if the child process is unresponsive
        await Promise.race([
          client.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Shutdown timeout")), 2000))
        ]);
        console.log(`✅ [PluginRegistry] Closed connection to ${name}`);
      } catch (err: any) {
        console.warn(`⚠️ [PluginRegistry] ${name} shutdown: ${err.message}`);
      }
    }
    this.mcpClients.clear();
  }

  public static async routeAndExecute(name: string, args: any, userId?: string): Promise<any> {
    if (name === "system__read_skill") {
      const skill = this.mdSkills.get(args.skillName);
      if (skill) return skill.content;
      return "Error: Skill not found.";
    }

    if (name === "system__update_skill") {
      const skill = this.mdSkills.get(args.skillName);
      if (!skill || !skill.filePath) return "Error: Skill not found or immutable.";
      await fs.writeFile(skill.filePath, args.newContent, "utf-8");
      await this.reloadMDSkills();
      return `Success: Skill ${args.skillName} updated and reloaded.`;
    }

    if (name.startsWith("filesystem__")) {
      const FileSystemController = require("../plugins/desktop/FileSystemController").FileSystemController;
      if (name === "filesystem__list_directory") return await FileSystemController.listDirectory(args.path);
      if (name === "filesystem__read_text_file") return await FileSystemController.readFileContent(args.path);
      if (name === "filesystem__write_text_file") return await FileSystemController.writeFileContent(args.path, args.content);
      if (name === "filesystem__delete_file") return await FileSystemController.deleteFile(args.path);
    }

    if (name.startsWith("desktop__")) {
        const InputController = require("../plugins/desktop/InputController").InputController;
        const VisualProbe = require("../plugins/desktop/VisualProbe").VisualProbe;

        if (name === "desktop__mouse_move") return await InputController.mouseMove(args.x, args.y);
        if (name === "desktop__mouse_click") return await InputController.mouseClick(args.clickType);
        if (name === "desktop__keyboard_type") return await InputController.typeText(args.text);
        if (name === "desktop__keyboard_press") return await InputController.pressKey(args.key);
        if (name === "desktop__scan_screen") return await VisualProbe.scanScreen();
        if (name === "desktop__find_element") return await VisualProbe.findElement(args.query);
        if (name === "desktop__take_snapshot") {
          const ScreenCapture = require("./ScreenCapture").ScreenCapture;
          const base64 = await ScreenCapture.captureBase64();
          return { status: "success", snapshot: `data:image/png;base64,${base64.substring(0, 50)}... [TRUNCATED]`, fullBase64: base64 };
        }
        if (name === "desktop__review_history") {
          const fs = require("fs").promises;
          const path = require("path");
          const historyDir = path.resolve(process.cwd(), "temp/visual_history");
          try {
            const files = await fs.readdir(historyDir);
            return { status: "success", history: files.sort().reverse() };
          } catch (e) {
            return { status: "error", message: "No visual history found." };
          }
        }
    }

    if (name.startsWith("messaging__")) {
        if (name === "messaging__send_telegram") {
          if (!args.text || args.text.trim() === "") {
            return "Error: Cannot send an empty message to Telegram. You must provide text content.";
          }
          const TelegramService = require("../services/telegramService").TelegramService;
          return await TelegramService.sendMessage(args.text, args.userId);
        }
    }


    // Check MCP Tools (namespaced by "serverName__toolName")
    const parts = name.split("__");
    if (parts.length >= 2) {
      const serverName = parts[0];
      let toolName = parts.slice(1).join("__");
      
      let clientKey = serverName;
      if (serverName === "browser" && userId) {
        clientKey = `${serverName}:${userId}`;
        // CRITICAL: Map standard aliases back to Puppeteer server conventions
        if (!toolName.startsWith("puppeteer_")) {
          toolName = `puppeteer_${toolName}`;
        }
      }

      let client = this.mcpClients.get(clientKey);

      // Lazy load dynamic browser client if missing
      if (!client && serverName === "browser" && userId) {
        console.log(`🚀 [PluginRegistry] Spawning isolated browser for user: ${userId}`);
        const configPath = path.join(__dirname, "../../src/plugins/mcp/mcp_config.json");
        const configData = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);
        const serverConfig = config.mcpServers.browser;

        const profilePath = path.resolve(process.cwd(), `.browser_profile_${userId}`);
        await fs.mkdir(profilePath, { recursive: true });

        const isolatedEnv = {
            ...process.env,
            PUPPETEER_LAUNCH_OPTIONS: JSON.stringify({ 
                userDataDir: profilePath,
                headless: false 
            })
        };

        const resolvedArgs = serverConfig.args?.map((arg: string) => this.resolvePath(arg));
        const resolvedEnv = Object.fromEntries(
          Object.entries(serverConfig.env || {}).map(([k, v]) => [k, this.resolvePath(v as string)])
        );

        const transport = new StdioClientTransport({
          command: serverConfig.command,
          args: resolvedArgs || serverConfig.args,
          env: { ...isolatedEnv, ...resolvedEnv }
        });

        const newClient = new Client(
          { name: "MidpointX", version: "2.0.0" },
          { capabilities: {} }
        );

        await newClient.connect(transport);
        this.mcpClients.set(clientKey, newClient);
        client = newClient;
      }

      if (client) {
         try {
           console.log(`📡 [PluginRegistry] Calling MCP Tool: ${serverName}__${toolName}`);
           console.log(`   Args: ${JSON.stringify(args)}`);
           
           const result = await client.callTool({ name: toolName, arguments: args });
           
           if (result.isError) {
             console.error(`❌ [PluginRegistry] Tool ${toolName} reported error:`, result.content);
           } else {
             console.log(`✅ [PluginRegistry] Tool ${toolName} returned success.`);
           }
           
           return result;
         } catch (e: any) {
           console.error(`❌ [PluginRegistry] MCP Tool call exception:`, e.message);
           throw new Error(`MCP Tool ${toolName} execution failed: ${e.message}`);
         }
      }
    }

    throw new Error(`Tool ${name} not found in registry. (User Context: ${userId || 'Global'})`);
  }

  private static resolvePath(p: string): string {
    if (typeof p !== 'string') return p;
    if (p.startsWith("./")) {
      return path.resolve(PROJECT_ROOT, p);
    }
    return p;
  }
}
