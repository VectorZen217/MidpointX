import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import cors from "cors";
import axios from "axios";

import { Config, reloadConfig } from "./core/config";
import { WorkspaceLoader } from "./core/workspaceLoader";
import { PluginRegistry } from "./core/pluginRegistry";
import { MidpointXGraph } from "./core/graph";
import { Observer } from "./core/observer";
import { ChannelRouter } from "./core/channelRouter";
import { EnvManager } from "./core/envManager";
import { PersistenceFactory } from "./core/persistence";

// Phase 3: Messaging Services
import { DiscordService } from "./services/discordService";
import { TelegramService } from "./services/telegramService";
import { initContextCache } from "./core/cacheManager";
import { SandboxManager } from "./core/sandboxManager";
import { a2aRouter } from "./routes/a2aRoutes";
import { uiApiRouter } from "./routes/uiApiRoutes";

// Global Log Filtering (Phase 4): Suppress verbose protocol logs in SILENT_MODE
if (Config.SILENT_MODE) {
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    const message = args.map(arg => String(arg)).join(" ");
    
    // Critical Whitelist: ONLY whitelist security alerts, hard failures, and startup
    const criticalIcons = ["🚀", "❌", "⛔", "🔔", "⚠️", "🔌", "✅"];
    const isCritical = criticalIcons.some(icon => message.includes(icon));
    
    // Blacklist: Suppress timestamped child logs and common internal noise
    const isTimestamp = /^\[\d{4}-\d{2}-\d{2}T/.test(message);
    const isNodeInternal = message.includes("node-telegram-bot-api") || message.includes("DeprecationWarning");
    
    if (isCritical || (!isTimestamp && !isNodeInternal)) {
      originalLog(...args);
    }
  };
  
  // Also filter warnings but keep errors
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args.map(arg => String(arg)).join(" ");
    const criticalIcons = ["🚨", "⚠️", "❌"];
    if (criticalIcons.some(icon => message.includes(icon))) {
      originalWarn(...args);
    }
  };
}

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
app.use("/api/v1/a2a", a2aRouter);
app.use("/api/v1", uiApiRouter);
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

// Webhook Authentication Middleware
// Validates the X-Webhook-Secret header against WEBHOOK_SECRET using a
// timing-safe comparison to prevent secret oracle / timing attacks.
function webhookAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const secret = Config.WEBHOOK_SECRET;

  if (!secret) {
    console.error("⛔ [Security] WEBHOOK_SECRET is not configured. Rejecting all /webhook/* requests.");
    res.status(503).json({ error: "Webhook endpoint not configured" });
    return;
  }

  const provided = req.headers["x-webhook-secret"];
  if (typeof provided !== "string" || provided.length === 0) {
    console.warn(`⚠️ [Security] Rejected unauthenticated webhook request from ${req.ip}`);
    res.status(401).json({ error: "Missing X-Webhook-Secret header" });
    return;
  }

  // timingSafeEqual requires equal-length buffers; intentional length check
  // prevents a short-circuit that would itself leak length information.
  const secretBuf = Buffer.from(secret, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  const lengthsMatch = secretBuf.length === providedBuf.length;
  // Always run timingSafeEqual to prevent timing oracle on length
  const safeCompare = crypto.timingSafeEqual(
    secretBuf,
    lengthsMatch ? providedBuf : secretBuf  // fallback keeps same length for constant time
  );
  if (!lengthsMatch || !safeCompare) {
    console.warn(`⚠️ [Security] Rejected webhook request with invalid secret from ${req.ip}`);
    res.status(401).json({ error: "Invalid X-Webhook-Secret" });
    return;
  }

  next();
}

// Webhook Listener for Proactive Sentinel Triggers
app.post("/webhook/*", webhookAuth, async (req, res) => {
  try {
    const webhookPath = req.path.replace(/^\/webhook\//, ""); // e.g. test-trigger
    console.log(`🪝 [Server] Received webhook request for ${webhookPath}`);
    
    // Fire and forget so we don't block the webhook response
    Observer.triggerWebhook(webhookPath, req.body).catch(err => {
      console.error(`❌ [Server] Background webhook processing failed:`, err);
    });
    
    res.json({ success: true, message: "Webhook accepted by Sentinel." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io Real-time Communication
io.on("connection", (socket) => {
  console.log(`User/Agent connected: ${socket.id}`);

  socket.emit("system:init", {
    provider: Config.ACTIVE_LLM_PROVIDER,
    model: Config.ACTIVE_MODEL_NAME,
    persistence: Config.PERSISTENCE_ADAPTER,
    env: process.env.NODE_ENV || "development"
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
            socket.emit("agent:approval_required", { action: result.action, severity: result.severity });

            // 30-Second "Undo" Window Logic
            if (result.severity === "undoable") {
              console.log(`⏱️ [Server] 30-second undo window started for task: ${payload.taskId}`);
              
              // We assign this timeout to a map or handle it inline. For now, inline is fine because 
              // the user clicking "cancel" or "approve" will fire a new loop:resume event.
              // We need a way to clear this timeout if they act manually.
              const autoResumeTimer = setTimeout(async () => {
                console.log(`⏱️ [Server] Auto-approving undoable action for task: ${payload.taskId}`);
                try {
                  const autoResult = await ChannelRouter.resume(payload.taskId, true, (update) => {
                    socket.emit("agent:progress", update);
                  });
                  if (typeof autoResult === "object" && (autoResult as any).needsApproval) {
                    socket.emit("agent:approval_required", { action: (autoResult as any).action, severity: (autoResult as any).severity });
                  } else {
                    const message = typeof autoResult === "object" ? (autoResult as any).message : autoResult;
                    const artifacts = typeof autoResult === "object" ? (autoResult as any).artifacts : [];
                    socket.emit("agent:message", { message, artifacts });
                    socket.emit("agent:complete", { message: "Task Fulfilled via Auto-Resume" });
                  }
                } catch (e) {
                  socket.emit("agent:error", { message: "Auto-Resumption Failed", error: String(e) });
                }
              }, 30000); // 30 seconds

              // Store timer reference on the socket object (quick and dirty) so we can clear it
              (socket as any).undoTimers = (socket as any).undoTimers || {};
              (socket as any).undoTimers[payload.taskId] = autoResumeTimer;
            }

        } else {
            const message = typeof result === "object" ? result.message : result;
            const artifacts = typeof result === "object" ? result.artifacts : [];
            const telemetry = typeof result === "object" ? result.telemetry : undefined;
            socket.emit("agent:message", { message, artifacts });
            socket.emit("agent:complete", { message: "Mission Accomplished", telemetry });
        }

    } catch (err) {
        console.error(err);
        socket.emit("agent:error", { message: "Task Failed", error: String(err) });
    }
  });

  // Support for Resuming from UI
  socket.on("loop:resume", async (payload: { taskId: string, approved: boolean }) => {
    // Clear the auto-resume timer if one exists
    if ((socket as any).undoTimers && (socket as any).undoTimers[payload.taskId]) {
      clearTimeout((socket as any).undoTimers[payload.taskId]);
      delete (socket as any).undoTimers[payload.taskId];
    }

    try {
      const response = await ChannelRouter.resume(payload.taskId, payload.approved, (update) => {
        socket.emit("agent:progress", update);
      });

      if (typeof response === "object" && (response as any).needsApproval) {
          socket.emit("agent:approval_required", { action: (response as any).action, severity: (response as any).severity });
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

async function startServer() {
  try {
    console.log("🛠️ [System] Initializing core subsystems...");
    await WorkspaceLoader.init();
    await PluginRegistry.init();
    await Observer.init(io); 
    
    // Initialize Messaging Channels with Socket.io for UI Sync
    await TelegramService.init(io);
    await DiscordService.init(io);
    await initContextCache();

    // Sandbox boot check: verify Docker is available and pre-pull base image
    if (Config.USE_DOCKER_SANDBOX) {
      const dockerReady = await SandboxManager.isDockerAvailable();
      if (!dockerReady) {
        console.warn("[SandboxManager] Docker daemon not found. Sandbox is DISABLED for this session. Install Docker Desktop to enable isolation.");
      } else {
        console.log("[SandboxManager] Docker available. Ensuring base image is present...");
        await SandboxManager.ensureBaseImage();
        console.log("[SandboxManager] Sandbox ready. Autonomous mode:", Config.SANDBOX_AUTONOMOUS_MODE);
      }
    }

    httpServer.listen(PORT, () => {
      console.log(`\n🚀 MidpointX Production Server running on port ${PORT}`);
      console.log("🛠️ [System] All core subsystems initialized and verified.");
    });
  } catch (err: any) {
    console.error("⛔ [Critical] System initialization failed:", err.message);
    process.exit(1);
  }
}

startServer();


// Graceful Shutdown Handling
const shutdown = async () => {
  console.log("\n🛑 [System] Shutdown signal received. Cleaning up...");
  await PluginRegistry.shutdown();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
