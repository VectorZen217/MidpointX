import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs/promises";
import cors from "cors";
import axios from "axios";

import { Config, reloadConfig } from "./core/config";
import { WorkspaceLoader } from "./core/workspaceLoader";
import { PluginRegistry } from "./core/pluginRegistry";
import { MidpointXGraph } from "./core/graph";
import { Scheduler } from "./core/scheduler";
import { ChannelRouter } from "./core/channelRouter";
import { EnvManager } from "./core/envManager";
import { PersistenceFactory } from "./core/persistence";

// Phase 3: Messaging Services
import { TelegramService } from "./services/telegramService";
import { DiscordService } from "./services/discordService";

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(",") 
  : ["http://localhost:3000", "http://localhost:5001"];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Serve static UI if built
const publicPath = path.resolve(__dirname, "../public");
app.use(express.static(publicPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins }
});

// API Routes
app.get("/api/v1/health", (req, res) => res.json({ status: "healthy", version: "2.0.0" }));

app.get("/api/v1/skills", async (req, res) => {
  try {
    const skills = await PluginRegistry.getMDSkills();
    res.json(skills);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/skills", async (req, res) => {
  try {
    const { name, description, content } = req.body;
    if (!name || !content) return res.status(400).json({ error: "Missing name or content" });
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const adapter = PersistenceFactory.getAdapter();
    
    const fileContent = `---\nname: ${name}\ndescription: ${description || "Custom skill"}\n---\n\n${content}\n`;
    await adapter.saveSkill(slug, fileContent);
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true, slug });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/v1/skills/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { name, description, content } = req.body;
    const skills = await PluginRegistry.getMDSkills();
    const skill = skills.find(s => s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug);
    
    if (!skill) return res.status(404).json({ error: "Skill not found" });
    
    const scheduleMatch = skill.content.match(/schedule:\s*["']?([^"'\s][^"']*)["']?/);
    const schedule = scheduleMatch ? scheduleMatch[1] : undefined;
    
    let frontmatter = `---\nname: ${name}\ndescription: ${description || "Custom skill"}\n`;
    if (schedule) frontmatter += `schedule: "${schedule}"\n`;
    frontmatter += `---`;
    
    const newContent = `${frontmatter}\n\n${content}\n`;
    const adapter = PersistenceFactory.getAdapter();
    await adapter.saveSkill(slug, newContent);
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/v1/skills/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const adapter = PersistenceFactory.getAdapter();
    await adapter.deleteLog("skills", slug); // Reusing deleteLog for skill removal
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/scheduler", async (req, res) => {
  try {
    const skills = await PluginRegistry.getMDSkills();
    const scheduledTasks = skills.map(skill => {
      const scheduleMatch = skill.content.match(/schedule:\s*["']?([^"'\s][^"']*)["']?/);
      const isCommented = skill.content.includes(`# schedule:`) || skill.content.includes(`// schedule:`); // Rough check
      
      return {
        name: skill.name,
        description: skill.description,
        schedule: scheduleMatch ? scheduleMatch[1] : null,
        enabled: !!scheduleMatch && !isCommented,
        slug: skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      };
    });
    res.json(scheduledTasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/scheduler/toggle", async (req, res) => {
  try {
    const { slug, enabled } = req.body;
    const adapter = PersistenceFactory.getAdapter();
    let content = await adapter.readSkill(slug);
    
    if (!content) return res.status(404).json({ error: "Skill not found" });
    
    if (enabled) {
      content = content.replace(/#\s*schedule:/, "schedule:");
    } else {
      content = content.replace(/schedule:/, "# schedule:");
    }
    
    await adapter.saveSkill(slug, content);
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/config", async (req, res) => {
  try {
    const env = await EnvManager.readEnv();
    res.json(env);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/config", async (req, res) => {
  try {
    await EnvManager.updateEnv(req.body);
    const newEnv = await EnvManager.readEnv();
    reloadConfig(newEnv);
    
    // Re-init services with new credentials if changed
    TelegramService.init(io);
    DiscordService.init(io);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/v1/ollama-models", async (req, res) => {
  try {
    const response = await axios.get("http://localhost:11434/api/tags");
    const models = response.data.models.map((m: any) => m.name);
    res.json({ success: true, models });
  } catch (err: any) {
    console.warn("Ollama unreachable:", err.message);
    res.json({ success: false, error: "Ollama not reachable", models: [] });
  }
});

// Socket.io Real-time Communication
io.on("connection", (socket) => {
  console.log(`User/Agent connected: ${socket.id}`);

  socket.emit("system:init", {
    provider: Config.ACTIVE_LLM_PROVIDER,
    model: Config.ACTIVE_MODEL_NAME
  });

  socket.on("loop:start", async (payload: { taskId: string, task: string, identity?: any, executionMode?: string }) => {
    socket.emit("agent:progress", { stage: "System Initialization" });

    try {
        // Use the centralized ChannelRouter to execute the task
        const result = await ChannelRouter.route({
            userId: payload.identity?.uid || "web_user_default", 
            intent: payload.task,
            channel: "web",
            executionMode: payload.executionMode || "api"
        }, (update) => {
            // Forward progress to the requesting socket
            socket.emit("agent:progress", update);
        });

        if (typeof result === "object" && result.needsApproval) {
            socket.emit("agent:approval_required", result.action);
        } else {
            const message = typeof result === "object" ? result.message : result;
            const artifacts = typeof result === "object" ? result.artifacts : [];
            socket.emit("agent:message", { message, artifacts });
            socket.emit("agent:complete", { message: "Mission Accomplished" });
        }

    } catch (err) {
        console.error(err);
        socket.emit("agent:error", { message: "Task Failed", error: String(err) });
    }
  });

  // Support for Resuming from UI
  socket.on("loop:resume", async (payload: { taskId: string, approved: boolean }) => {
    try {
      const response = await ChannelRouter.resume(payload.taskId, payload.approved, (update) => {
        socket.emit("agent:progress", update);
      });

      if (typeof response === "object" && (response as any).needsApproval) {
          socket.emit("agent:approval_required", (response as any).action);
      } else {
          const message = typeof response === "object" ? (response as any).message : response;
          const artifacts = typeof response === "object" ? (response as any).artifacts : [];
          socket.emit("agent:message", { message, artifacts });
          socket.emit("agent:complete", { message: "Task Fulfilled" });
      }
    } catch (err) {
      socket.emit("agent:error", { message: "Resumption Failed", error: String(err) });
    }
  });
});

const PORT = Config.PORT;
httpServer.listen(PORT, async () => {
  console.log(`\n🚀 MidpointX Production Server running on port ${PORT}`);
  
  try {
    await WorkspaceLoader.init();
    await PluginRegistry.init();
    await Scheduler.init(io); 
    
    // Initialize Messaging Channels with Socket.io for UI Sync
    await TelegramService.init(io);
    await DiscordService.init(io);

    console.log("🛠️ [System] All core subsystems initialized and verified.");
  } catch (err: any) {
    console.error("⛔ [Critical] System initialization failed:", err.message);
  }
});

// Graceful Shutdown Handling
const shutdown = async () => {
  console.log("\n🛑 [System] Shutdown signal received. Cleaning up...");
  await PluginRegistry.shutdown();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
