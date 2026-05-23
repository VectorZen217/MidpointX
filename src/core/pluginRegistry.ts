// Provider-agnostic tool declaration types (replaces @google/genai imports)
export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

// Type alias retained for any downstream code referencing Type.STRING etc.
export const Type = {
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
  ARRAY: "array",
  OBJECT: "object",
} as const;
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs/promises";
import path from "path";
import { Observer } from "./observer";
const PROJECT_ROOT = path.resolve(__dirname, "../../");

export interface MDSkill {
  name: string;
  description: string;
  content: string;
  filePath?: string;
  schedule?: string; // Cron expression for proactive tasks
  watchPath?: string; // Directory to watch for file system events
  webhookPath?: string; // Endpoint path for webhook listener
}

export class PluginRegistry {
  private static mdSkills: Map<string, MDSkill> = new Map();
  private static mcpClients: Map<string, Client> = new Map();
  private static clientModes: Map<string, string> = new Map(); // Stores 'api' or 'visual'
  private static activeTools: FunctionDeclaration[] = [];

  static async init() {
    console.log("🧩 [PluginRegistry] Initialization Framework...");
    await this.initMDSkills();
    await this.initMCPServers();
    await this.rebuildToolsArray();
    
    // We don't call Observer.init() here because server.ts needs to pass 'io'
  }

  public static getMDSkills(): MDSkill[] {
    return Array.from(this.mdSkills.values());
  }

  public static async reloadMDSkills() {
    console.log("🧩 [PluginRegistry] Hot-reloading MD Skills...");
    this.mdSkills.clear();
    await this.initMDSkills();
    await this.rebuildToolsArray();
    await Observer.sync(); // Keep the heartbeat in sync
  }

  /**
   * Hot-reloads a single skill file into the live registry without restarting
   * MCP connections. Called by SkillAcquisitionActor after synthesizing a new skill.
   */
  public static async hotReloadSkill(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const nameMatch = content.match(/name:\s*(.+)/);
      const descMatch = content.match(/description:\s*(.+)/);
      if (!nameMatch) {
        console.warn("⚠️ [PluginRegistry] hotReloadSkill: No 'name' field found in", filePath);
        return "";
      }
      const skillName = nameMatch[1].trim();
      if (skillName.includes('[') || skillName.includes(']')) {
        console.warn("⚠️ [PluginRegistry] hotReloadSkill: Refusing to load template/placeholder name:", skillName);
        return "";
      }
      this.mdSkills.set(skillName, {
        name: skillName,
        description: descMatch ? descMatch[1].trim() : "Synthesized agent skill",
        content,
        filePath,
      });
      console.log(`✅ [PluginRegistry] Hot-loaded synthesized skill: ${skillName}`);
      return skillName;
    } catch (e: any) {
      console.error("❌ [PluginRegistry] hotReloadSkill failed:", e.message);
      return "";
    }
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
          const scheduleMatch = content.match(/schedule:\s*["']?([^"'\n\r]+)["']?/);
          const watchPathMatch = content.match(/watchPath:\s*["']?([^"'\n\r]+)["']?/);
          const webhookPathMatch = content.match(/webhookPath:\s*["']?([^"'\n\r]+)["']?/);
          
          if (nameMatch) {
            const skillName = nameMatch[1].trim();
            if (skillName.includes('[') || skillName.includes(']')) {
              console.log(`⏩ [PluginRegistry] Skipping template/placeholder file: ${entry.name}`);
              return;
            }
            this.mdSkills.set(skillName, {
              name: skillName,
              description: descMatch ? descMatch[1].trim() : "Custom Agent Skill",
              content: content,
              filePath: filePath,
              schedule: scheduleMatch ? scheduleMatch[1].trim() : undefined,
              watchPath: watchPathMatch ? watchPathMatch[1].trim() : undefined,
              webhookPath: webhookPathMatch ? webhookPathMatch[1].trim() : undefined
            });
            console.log(`✅ [PluginRegistry] Loaded MD Skill: ${skillName} (${entry.isDirectory() ? 'DIR' : 'FILE'})`);
            if (scheduleMatch) console.log(`   └─ ⏰ Schedule: ${scheduleMatch[1].trim()}`);
            if (watchPathMatch) console.log(`   └─ 📁 Watching: ${watchPathMatch[1].trim()}`);
            if (webhookPathMatch) console.log(`   └─ 🪝 Webhook: ${webhookPathMatch[1].trim()}`);
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
        const hasPlaceholder = envEntries.some(([_k, v]) => 
          String(v).includes("INSERT_YOUR") || 
          String(v).includes("YOUR_") || 
          String(v).includes("_HERE") ||
          String(v).length === 0
        );
        
        if (hasPlaceholder) {
            console.warn(`⏩ [PluginRegistry] Skipping ${serverName}: Missing or placeholder API tokens detected.`);
            return;
        }

        try {
          const resolvedArgs = serverConfig.args?.map((arg: string) => this.resolvePath(arg));
          const resolvedEnv = Object.fromEntries(
            Object.entries(serverConfig.env || {}).map(([k, v]) => [k, this.resolvePath(v as string)])
          );

          console.log(`🔌 [PluginRegistry] Attempting connection to global MCP server: ${serverName}`);

          let finalCommand = serverConfig.command;
          let finalArgs = resolvedArgs || serverConfig.args || [];
          
          if (process.platform === "win32") {
            finalArgs = ["/d", "/s", "/c", finalCommand, ...finalArgs];
            finalCommand = "cmd.exe";
          }

          const transport = new StdioClientTransport({
            command: finalCommand,
            args: finalArgs,
            env: Object.fromEntries(
              Object.entries({ ...process.env, ...resolvedEnv })
                .filter(([, v]) => v !== undefined)
            ) as Record<string, string>
          });

          const client = new Client(
            { name: "MidpointX", version: "2.0.0" },
            { capabilities: {} }
          );

          // Connect with timeout to prevent whole-system hang
          await Promise.race([
            client.connect(transport, { timeout: 180000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Connection timeout after 180s`)), 180000))
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

  /**
   * Sanitizes a JSON Schema for Gemini API compatibility.
   * Gemini's FunctionDeclaration schema is a strict subset of JSON Schema.
   * This recursively patches known incompatibilities from MCP server tool schemas.
   */
  private static sanitizeSchema(schema: any, path = "root"): any {
    if (!schema || typeof schema !== "object") return schema;

    // Strip top-level keywords Gemini doesn't support
    const cleaned: any = {};
    const ALLOWED_KEYS = new Set(["type", "description", "properties", "required", "items", "enum", "nullable", "format"]);

    for (const [key, value] of Object.entries(schema)) {
      if (ALLOWED_KEYS.has(key)) {
        cleaned[key] = value;
      }
      // Drop: $schema, additionalProperties, anyOf, oneOf, allOf, $ref, default, examples, etc.
    }

    // Normalize type: if array of types, pick the first non-null
    if (Array.isArray(cleaned.type)) {
      const nonNull = cleaned.type.filter((t: string) => t !== "null");
      cleaned.type = nonNull.length > 0 ? nonNull[0] : "string";
      cleaned.nullable = true;
    }

    // If type is missing but properties exist, infer object
    if (!cleaned.type && cleaned.properties) {
      cleaned.type = "object";
    }

    // If type is missing entirely, default to string
    if (!cleaned.type) {
      cleaned.type = "string";
    }

    // CRITICAL: array types MUST have items defined for Gemini
    if (cleaned.type === "array") {
      if (!cleaned.items || typeof cleaned.items !== "object") {
        // Default to array of strings — the safest fallback
        cleaned.items = { type: "string" };
      } else {
        cleaned.items = this.sanitizeSchema(cleaned.items, `${path}.items`);
      }
    }

    // Recursively sanitize nested properties
    if (cleaned.type === "object" && cleaned.properties && typeof cleaned.properties === "object") {
      const sanitizedProps: any = {};
      for (const [propKey, propValue] of Object.entries(cleaned.properties)) {
        sanitizedProps[propKey] = this.sanitizeSchema(propValue, `${path}.${propKey}`);
      }
      cleaned.properties = sanitizedProps;
    } else if (cleaned.type === "object" && !cleaned.properties) {
      cleaned.properties = {};
    }

    // Trim empty descriptions
    if (cleaned.description === "" || cleaned.description === null) {
      delete cleaned.description;
    }

    return cleaned;
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
          const sanitizedParams = this.sanitizeSchema(tool.inputSchema || { type: "object", properties: {} });
          rawTools.push({
            name: `${serverName}__${tool.name}`,
            description: tool.description || `Tool ${tool.name} from ${serverName}`,
            parameters: sanitizedParams as any
          });
        }
      } catch (err: any) {
        console.error(`❌ [PluginRegistry] Failed to fetch tools from global ${serverName}: ${err.message}`);
      }
    }

    // Special handling for browser - since it's lazy, we fetch its tool schema once from a temp instance or just use standard puppeteer tool set
    // For simplicity, if browser config is present, we assume standard puppeteer tools are available if the server is @modelcontextprotocol/server-puppeteer
    if (config.mcpServers && config.mcpServers.browser) {
        // We add hardcoded standard browser tools if they aren't already listed
        const browserToolSchemas: Record<string, any> = {
          "navigate": { type: "object", properties: { url: { type: "string", description: "The URL to navigate to." } }, required: ["url"] },
          "screenshot": { type: "object", properties: { name: { type: "string", description: "Optional name for the screenshot file." } } },
          "click": { type: "object", properties: { selector: { type: "string", description: "CSS selector of the element to click." } }, required: ["selector"] },
          "type": { type: "object", properties: { selector: { type: "string", description: "CSS selector of the element to type into." }, text: { type: "string", description: "The text to type." } }, required: ["selector", "text"] },
          "fill": { type: "object", properties: { selector: { type: "string", description: "CSS selector of the element to fill." }, value: { type: "string", description: "The value to fill." } }, required: ["selector", "value"] },
          "hover": { type: "object", properties: { selector: { type: "string", description: "CSS selector of the element to hover over." } }, required: ["selector"] },
          "wait_for_selector": { type: "object", properties: { selector: { type: "string", description: "CSS selector to wait for." } }, required: ["selector"] },
          "evaluate": { 
            type: "object", 
            properties: { 
              script: { 
                type: "string", 
                description: "The JavaScript script/expression to evaluate in the browser context. Example: 'document.body.innerText'" 
              } 
            }, 
            required: ["script"] 
          },
          "page_content": {
            type: "object",
            description: "Retrieve the visible text content of the current page (max 8000 chars). Does NOT return HTML or CSS selectors. To find selectors for clicking, use browser__evaluate with a JS expression.",
            properties: {}
          },
          "select_option": { 
            type: "object", 
            properties: { 
              selector: { type: "string", description: "CSS selector of the select element." },
              value: { type: "string", description: "The value to select." }
            }, 
            required: ["selector", "value"] 
          },
          "drag_and_drop": { 
            type: "object", 
            properties: { 
              source: { type: "string", description: "CSS selector of the element to drag." },
              destination: { type: "string", description: "CSS selector of the drop target." }
            }, 
            required: ["source", "destination"] 
          }
        };

        const browserTools = ["navigate", "screenshot", "click", "hover", "type", "evaluate", "fill", "select_option", "drag_and_drop", "wait_for_selector", "page_content"];
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
    const builtinFS = ["list_directory", "read_text_file", "write_text_file", "search_files", "delete_file", "exists"];
    builtinFS.forEach(fsTool => {
       const toolName = `filesystem__${fsTool}`;
       if (rawTools.some(t => t.name === toolName)) return;
       
       let description = `Cross-platform native filesystem operation: ${fsTool}`;
       if (fsTool === "write_text_file") {
         description = "Write content to a file. Automatically creates parent directories recursively if they do not exist.";
       }
       if (fsTool === "exists") {
         description = "Check if a file or directory exists at the specified path.";
       }

       rawTools.push({
         name: toolName,
         description: description,
         parameters: {
             type: "object", properties: { path: { type: "string" }, content: { type: "string" }, pattern: { type: "string" } }
         } as any
       });
    });

    const desktopToolSchemas: Record<string, any> = {
      "mouse_move": { 
        type: "object", 
        properties: { 
          x: { type: "number", description: "The X coordinate to move the mouse cursor to. Get these coordinates from 'find_element'." }, 
          y: { type: "number", description: "The Y coordinate to move the mouse cursor to. Get these coordinates from 'find_element'." } 
        }, 
        required: ["x", "y"] 
      },
      "mouse_click": { 
        type: "object", 
        properties: { 
          clickType: { type: "string", enum: ["left", "right", "double"], description: "The type of mouse click to perform at the current cursor position." } 
        }, 
        required: ["clickType"] 
      },
      "keyboard_type": { 
        type: "object", 
        properties: { 
          text: { type: "string", description: "The text string to type on the keyboard at the current focus point." } 
        }, 
        required: ["text"] 
      },
      "keyboard_press": { 
        type: "object", 
        properties: { 
          key: { type: "string", description: "The specific key to press and release (e.g., 'ENTER', 'TAB', 'ESCAPE', 'SPACE', 'BACKSPACE')." } 
        }, 
        required: ["key"] 
      },
      "scan_screen": { 
        type: "object", 
        description: "Analyze the current screen state visually and return a natural language description of active windows and UI elements.",
        properties: {} 
      },
      "find_element": { 
        type: "object", 
        properties: { 
          query: { type: "string", description: "A visual description or text label of the UI element you want to find coordinates for." } 
        }, 
        required: ["query"] 
      },
      "take_snapshot": { 
        type: "object", 
        description: "Capture a high-resolution screenshot of the current desktop and return it as base64 for visual confirmation.",
        properties: {} 
      },
      "take_snapshot_with_grid": { 
        type: "object", 
        description: "Capture a screenshot of the current desktop overlaid with a highly visible 12x8 red coordinate grid labeled A1 to L8 for pixel-perfect visual element grounding.",
        properties: {} 
      },
      "click_grid_cell": { 
        type: "object", 
        properties: { 
          cell: { type: "string", description: "The grid coordinate cell identifier containing the target element (e.g. 'D4', 'H2')." },
          clickType: { type: "string", enum: ["left", "right", "double"], description: "The type of click to perform at the center of the cell." }
        }, 
        required: ["cell", "clickType"] 
      },
      "review_history": { 
        type: "object", 
        description: "List the last 10 screenshots captured to review recent visual changes.",
        properties: {} 
      }
    };

    const builtinDesktop = ["mouse_move", "mouse_click", "keyboard_type", "keyboard_press", "scan_screen", "find_element", "take_snapshot", "take_snapshot_with_grid", "click_grid_cell", "review_history"];
    const builtinMessaging = ["send_telegram"];
    builtinDesktop.forEach(deskTool => {
       const toolName = `desktop__${deskTool}`;
       if (rawTools.some(t => t.name === toolName)) return;
       rawTools.push({
         name: toolName,
         description: `Native OS automation operation: ${deskTool}`,
         parameters: desktopToolSchemas[deskTool] || { type: "object", properties: {} } as any
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
      description: "Create a new theorem/skill or update an existing one. If creating a new skill, provide the new content following the SKILL_TEMPLATE.md format.",
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

  public static async routeAndExecute(name: string, args: any, userId?: string, executionMode: string = 'api'): Promise<any> {
    if (name === "system__read_skill") {
      const skill = this.mdSkills.get(args.skillName);
      if (skill) return skill.content;
      return "Error: Skill not found.";
    }

    if (name === "system__update_skill") {
      let skillPath;
      const skill = this.mdSkills.get(args.skillName);
      if (skill && skill.filePath) {
        skillPath = skill.filePath;
      } else {
        // Upsert: Create a new skill file
        skillPath = path.resolve(__dirname, "../../src/plugins/skills", `${args.skillName}.md`);
      }
      await fs.writeFile(skillPath, args.newContent, "utf-8");
      await this.reloadMDSkills();
      return `Success: Skill ${args.skillName} updated/created and reloaded.`;
    }

    if (name.startsWith("filesystem__")) {
      const FileSystemController = require("../plugins/desktop/FileSystemController").FileSystemController;
      if (name === "filesystem__list_directory") return await FileSystemController.listDirectory(args.path);
      if (name === "filesystem__read_text_file") return await FileSystemController.readFileContent(args.path);
      if (name === "filesystem__write_text_file") return await FileSystemController.writeFileContent(args.path, args.content);
      if (name === "filesystem__delete_file") return await FileSystemController.deleteFile(args.path);
      if (name === "filesystem__exists") return await FileSystemController.exists(args.path);
      if (name === "filesystem__search_files") return await FileSystemController.searchFiles(args.path, args.pattern);
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
          const ScreenCapture = require("../plugins/desktop/ScreenCapture").ScreenCapture;
          const base64 = await ScreenCapture.captureBase64();
          return { status: "success", snapshot: `data:image/png;base64,${base64.substring(0, 50)}... [TRUNCATED]`, fullBase64: base64 };
        }
        if (name === "desktop__take_snapshot_with_grid") {
          const ScreenCapture = require("../plugins/desktop/ScreenCapture").ScreenCapture;
          const base64 = await ScreenCapture.captureBase64(true);
          return { status: "success", snapshot: `data:image/png;base64,${base64.substring(0, 50)}... [TRUNCATED]`, fullBase64: base64 };
        }
        if (name === "desktop__click_grid_cell") {
          const ScreenCapture = require("../plugins/desktop/ScreenCapture").ScreenCapture;
          const InputController = require("../plugins/desktop/InputController").InputController;
          const { screen } = require("@nut-tree-fork/nut-js");
          
          const cell = (args.cell || "").toUpperCase().trim();
          const clickType = args.clickType || "left";
          
          if (!/^[A-L][1-8]$/.test(cell)) {
            return { status: "error", message: `Invalid cell coordinate format: "${cell}". Must be between A1 and L8.` };
          }
          
          const colChar = cell.charAt(0);
          const rowChar = cell.charAt(1);
          
          const colIndex = colChar.charCodeAt(0) - 65; // A=0, B=1, ...
          const rowIndex = parseInt(rowChar, 10) - 1; // 1=0, 2=1, ...
          
          const W = await screen.width();
          const H = await screen.height();
          
          const cols = 12;
          const rows = 8;
          
          const cellW = W / cols;
          const cellH = H / rows;
          
          const x = Math.round((colIndex * cellW) + (cellW / 2));
          const y = Math.round((rowIndex * cellH) + (cellH / 2));
          
          await InputController.mouseMove(x, y);
          const clickResult = await InputController.mouseClick(clickType);
          
          return {
            status: "success",
            message: `Clicked grid cell ${cell} at pixel coordinate x:${x}, y:${y}`,
            clickResult
          };
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


    // 1. Context-Aware Tool Name Normalization (Robustness)
    // If the model calls 'navigate' instead of 'browser__navigate', try to resolve it.
    // Also handles MCP servers like 'fetch' -> 'fetch__fetch'
    if (!name.includes("__")) {
      // Build dynamic prefix list from all registered MCP servers + builtins
      const knownPrefixes = ["browser", "filesystem", "desktop", "system", "messaging"];
      for (const serverName of this.mcpClients.keys()) {
        // Strip user-isolated keys like "browser:123" to just "browser"
        const baseServerName = serverName.split(":")[0];
        if (!knownPrefixes.includes(baseServerName)) {
          knownPrefixes.push(baseServerName);
        }
      }

      for (const prefix of knownPrefixes) {
        const potentialName = `${prefix}__${name}`;
        // Check if this tool exists in our active tools array
        if (this.activeTools.some(t => t.name === potentialName)) {
           console.log(`🧠 [PluginRegistry] Normalizing tool name: ${name} -> ${potentialName}`);
           name = potentialName;
           break;
        }
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
        
        // Parameter Normalization: Ensure 'script' is used for evaluate (MCP expects 'script')
        if (toolName === "puppeteer_evaluate") {
          if (args.expression && !args.script) {
            args.script = args.expression;
            delete args.expression;
          }
        }

        // Parameter Normalization: Map 'text' to 'value' for fill if needed
        if (toolName === "puppeteer_fill") {
          if (args.text && !args.value) {
            args.value = args.text;
            delete args.text;
          }
        }
        
        // Parameter Normalization: Map 'value' to 'text' for type if needed
        if (toolName === "puppeteer_type") {
          if (args.value && !args.text) {
            args.text = args.value;
            delete args.value;
          }
        }

        // Virtual Tool: browser__page_content maps to a resilient evaluate call
        if (toolName === "puppeteer_page_content") {
          toolName = "puppeteer_evaluate";
          args = { script: "(() => { try { return document.body ? document.body.innerText.substring(0, 8000) : 'PAGE_LOAD_FAILED: Empty body'; } catch(e) { return 'PAGE_LOAD_FAILED: ' + e.message; } })()" };
        }
      }

      let client = this.mcpClients.get(clientKey);
      const currentMode = this.clientModes.get(clientKey);

      // 🔄 Mode Switch Logic: If the browser is running in the wrong mode (e.g. headless but we need visible), kill it
      if (client && serverName === "browser" && currentMode && currentMode !== executionMode) {
        console.log(`🔄 [PluginRegistry] Mode mismatch for ${clientKey} (${currentMode} -> ${executionMode}). Restarting browser...`);
        try {
          await client.close();
        } catch (e) {}
        this.mcpClients.delete(clientKey);
        this.clientModes.delete(clientKey);
        client = undefined;
      }

      // Lazy load dynamic browser client if missing
      if (!client && serverName === "browser" && userId) {
        console.log(`🚀 [PluginRegistry] Spawning isolated browser for user: ${userId}`);
        const configPath = path.join(__dirname, "../../src/plugins/mcp/mcp_config.json");
        const configData = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);
        const serverConfig = config.mcpServers.browser;

        const profilePath = path.resolve(process.cwd(), `.browser_profile_${userId}`);
        await fs.mkdir(profilePath, { recursive: true });

        const isHeadless = executionMode === 'api';
        console.log(`🌐 [PluginRegistry] Mode: ${executionMode.toUpperCase()} | Browser: ${isHeadless ? 'HEADLESS' : 'VISIBLE'}`);

        const isolatedEnv = {
            ...process.env,
            PUPPETEER_LAUNCH_OPTIONS: JSON.stringify({ 
                userDataDir: profilePath,
                headless: isHeadless ? "new" : false,
                args: isHeadless 
                    ? ["--headless=new", "--hide-scrollbars", "--mute-audio", "--disable-http2", "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"] 
                    : ["--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"]
            })
        };

        const resolvedArgs = serverConfig.args?.map((arg: string) => this.resolvePath(arg));
        const resolvedEnv = Object.fromEntries(
          Object.entries(serverConfig.env || {}).map(([k, v]) => [k, this.resolvePath(v as string)])
        );

        let finalCommand = serverConfig.command;
        let finalArgs = resolvedArgs || serverConfig.args || [];
        
        if (process.platform === "win32") {
          finalArgs = ["/d", "/s", "/c", finalCommand, ...finalArgs];
          finalCommand = "cmd.exe";
        }

        const transport = new StdioClientTransport({
          command: finalCommand,
          args: finalArgs,
          env: { ...resolvedEnv, ...isolatedEnv }
        });

        const newClient = new Client(
          { name: "MidpointX", version: "2.0.0" },
          { capabilities: {} }
        );

        // Connect with timeout to prevent whole-system hang (Lazy Load)
        await Promise.race([
          newClient.connect(transport, { timeout: 180000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Browser connection timeout after 180s`)), 180000))
        ]);
        this.mcpClients.set(clientKey, newClient);
        this.clientModes.set(clientKey, executionMode);
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
