import { Router } from "express";
import axios from "axios";
import { reloadConfig } from "../core/config";
import { EnvManager } from "../core/envManager";
import { TelegramService } from "../services/telegramService";
import { DiscordService } from "../services/discordService";
import { Server } from "socket.io";

export function makeConfigRoutes(io: Server): Router {
  const router = Router();

  router.get("/config", async (req, res) => {
    try {
      res.json(await EnvManager.readEnv());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/config", async (req, res) => {
    try {
      await EnvManager.updateEnv(req.body);
      const newEnv = await EnvManager.readEnv();
      reloadConfig(newEnv);
      TelegramService.init(io);
      DiscordService.init(io);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/ollama-models", async (req, res) => {
    try {
      const response = await axios.get("http://localhost:11434/api/tags");
      const models = (response.data.models as any[]).map((m: any) => m.name);
      res.json({ success: true, models });
    } catch (err: any) {
      console.warn("Ollama unreachable:", err.message);
      res.json({ success: false, error: "Ollama not reachable", models: [] });
    }
  });

  return router;
}
