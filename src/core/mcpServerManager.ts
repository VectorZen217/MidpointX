import fs from "fs/promises";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "src/plugins/mcp/mcp_config.json");

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  source: "library" | "custom";
}

export interface MCPServerLibraryEntry {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  defaultEnv: Record<string, string>;
  configFields: Array<{ key: string; label: string; placeholder?: string }>;
}

export const MCP_SERVER_LIBRARY: MCPServerLibraryEntry[] = [
  {
    id: "filesystem", name: "Filesystem", description: "Read and write files on the local filesystem",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
    defaultEnv: {}, configFields: [{ key: "rootPath", label: "Root Path", placeholder: "./" }]
  },
  {
    id: "github", name: "GitHub", description: "Repos, issues, PRs, commits via GitHub REST API",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-github"],
    defaultEnv: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    configFields: [{ key: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "Personal Access Token" }]
  },
  {
    id: "brave-search", name: "Brave Search", description: "Web search via Brave Search API",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"],
    defaultEnv: { BRAVE_API_KEY: "" },
    configFields: [{ key: "BRAVE_API_KEY", label: "Brave API Key" }]
  },
  {
    id: "sqlite", name: "SQLite", description: "Query SQLite databases",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./src/workspace/midpointx.db"],
    defaultEnv: {}, configFields: [{ key: "dbPath", label: "Database Path", placeholder: "./src/workspace/midpointx.db" }]
  },
  {
    id: "memory", name: "Knowledge Graph", description: "Persistent shared knowledge graph memory",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"],
    defaultEnv: {}, configFields: []
  },
  {
    id: "puppeteer", name: "Puppeteer Browser", description: "Browser automation and web scraping",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    defaultEnv: {}, configFields: []
  },
  {
    id: "slack", name: "Slack", description: "Read and post to Slack channels",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"],
    defaultEnv: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    configFields: [
      { key: "SLACK_BOT_TOKEN", label: "Bot Token" },
      { key: "SLACK_TEAM_ID", label: "Team ID" }
    ]
  },
  {
    id: "google-maps", name: "Google Maps", description: "Location search, directions, and geocoding",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-google-maps"],
    defaultEnv: { GOOGLE_MAPS_API_KEY: "" },
    configFields: [{ key: "GOOGLE_MAPS_API_KEY", label: "Maps API Key" }]
  },
  {
    id: "postgres", name: "PostgreSQL", description: "Query PostgreSQL databases",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"],
    defaultEnv: { POSTGRES_CONNECTION_STRING: "" },
    configFields: [{ key: "POSTGRES_CONNECTION_STRING", label: "Connection String", placeholder: "postgresql://user:pass@host/db" }]
  },
  {
    id: "fetch", name: "Fetch", description: "HTTP fetch utility — retrieve any URL as text or JSON",
    command: "uvx", args: ["mcp-server-fetch"],
    defaultEnv: {}, configFields: []
  }
];

export class MCPServerManager {
  private static logs: Map<string, string[]> = new Map();

  static getLibrary(): MCPServerLibraryEntry[] {
    return MCP_SERVER_LIBRARY;
  }

  static async getActive(): Promise<Array<{ id: string; name: string; source: string; status: "running" | "registered" | "unknown" }>> {
    const config = await this.readConfig();
    return Object.entries(config.mcpServers ?? {}).map(([id, s]: [string, any]) => ({
      id,
      name: s.name ?? id,
      source: s.source ?? "custom",
      status: "registered" as const
    }));
  }

  static async add(serverConfig: MCPServerConfig): Promise<void> {
    const config = await this.readConfig();
    config.mcpServers = config.mcpServers ?? {};
    config.mcpServers[serverConfig.id] = {
      name: serverConfig.name,
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
      source: serverConfig.source
    };
    await this.writeConfig(config);
    console.log(`✅ [MCPServerManager] Added server: ${serverConfig.id}. Restart to activate.`);
  }

  static async remove(id: string): Promise<void> {
    const config = await this.readConfig();
    if (config.mcpServers) delete config.mcpServers[id];
    await this.writeConfig(config);
    this.logs.delete(id);
  }

  static getLogs(id: string): string[] {
    return this.logs.get(id) ?? [];
  }

  static appendLog(id: string, line: string): void {
    const logs = this.logs.get(id) ?? [];
    logs.push(`[${new Date().toISOString()}] ${line}`);
    if (logs.length > 200) logs.shift();
    this.logs.set(id, logs);
  }

  private static async readConfig(): Promise<any> {
    try {
      return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
    } catch { return { mcpServers: {} }; }
  }

  private static async writeConfig(config: any): Promise<void> {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  }
}
