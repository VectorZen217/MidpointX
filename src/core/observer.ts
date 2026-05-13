import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import * as chokidar from "chokidar";
import { MidpointXGraph } from "./graph";
import { PluginRegistry, MDSkill } from "./pluginRegistry";
import { Config } from "./config";
import { Server } from "socket.io";
import { MemoryManager } from "./memory";
import { pruningNode } from "../nodes/pruningNode";
import path from "path";

/**
 * Observer — The Proactive Sentinel System of MidpointX.
 * Monitors cron schedules, file system events, and webhooks.
 */
export class Observer {
  private static cronJobs: Map<string, ScheduledTask> = new Map();
  private static fileWatchers: Map<string, chokidar.FSWatcher> = new Map();
  private static ioInstance?: Server;

  static async init(io?: Server) {
    console.log("⏰ [Observer] Initializing Proactive Sentinel System...");
    this.ioInstance = io;
    await this.sync();

    if (Config.ENABLE_SLEEP_CYCLE) {
      this.registerSleepCycle();
    }
  }

  static async sync() {
    console.log("⏰ [Observer] Syncing watched events & schedules...");
    const skills = PluginRegistry.getMDSkills();
    
    const activeSkillNames = new Set(skills.map(s => s.name));
    
    // Cleanup stale cron jobs
    for (const [name, job] of this.cronJobs.entries()) {
      if (!activeSkillNames.has(name) || !skills.find(s => s.name === name)?.schedule) {
        console.log(`⏰ [Observer] De-scheduling inactive cron: ${name}`);
        job.stop();
        this.cronJobs.delete(name);
      }
    }

    // Cleanup stale file watchers
    for (const [name, watcher] of this.fileWatchers.entries()) {
      if (!activeSkillNames.has(name) || !skills.find(s => s.name === name)?.watchPath) {
        console.log(`👀 [Observer] Stopping file watcher: ${name}`);
        await watcher.close();
        this.fileWatchers.delete(name);
      }
    }

    // Add or update watchers & crons
    for (const skill of skills) {
      if (skill.schedule) this.scheduleSkill(skill);
      if (skill.watchPath) this.watchSkillPath(skill);
    }
  }

  private static scheduleSkill(skill: MDSkill) {
    if (this.cronJobs.has(skill.name)) {
        this.cronJobs.get(skill.name)?.stop();
    }
    try {
        if (!skill.schedule) return;
        console.log(`⏰ [Observer] Scheduling cron for: ${skill.name} [${skill.schedule}]`);
        const job = cron.schedule(skill.schedule, async () => {
          await this.triggerProactiveEvent("cron", skill, { time: new Date().toISOString() });
        });
        this.cronJobs.set(skill.name, job);
    } catch (err: any) {
        console.error(`❌ [Observer] Invalid cron expression for ${skill.name}: ${skill.schedule}`);
    }
  }

  private static watchSkillPath(skill: MDSkill) {
    if (this.fileWatchers.has(skill.name)) {
      this.fileWatchers.get(skill.name)?.close();
    }
    try {
      if (!skill.watchPath) return;
      const targetPath = path.resolve(process.cwd(), skill.watchPath);
      console.log(`👀 [Observer] Watching filesystem for: ${skill.name} at [${targetPath}]`);
      
      const watcher = chokidar.watch(targetPath, { persistent: true, ignoreInitial: true });
      watcher.on('all', async (event, eventPath) => {
        // Debounce or filter events if needed, but for now trigger on everything
        await this.triggerProactiveEvent("fs_event", skill, { event, path: eventPath });
      });
      
      this.fileWatchers.set(skill.name, watcher);
    } catch (err) {
      console.error(`❌ [Observer] Failed to watch path for ${skill.name}:`, err);
    }
  }

  public static async triggerWebhook(webhookPath: string, payload: any) {
    const skills = PluginRegistry.getMDSkills();
    const targetSkill = skills.find(s => s.webhookPath === webhookPath);
    if (!targetSkill) {
      console.warn(`⚠️ [Observer] Received webhook for unmapped path: ${webhookPath}`);
      return;
    }
    console.log(`🪝 [Observer] Webhook triggered for: ${targetSkill.name}`);
    await this.triggerProactiveEvent("webhook", targetSkill, payload);
  }

  private static async triggerProactiveEvent(triggerType: string, skill: MDSkill, eventData: any) {
    const intentId = `PROACTIVE_${skill.name}`;
    
    if (MemoryManager.checkTriggerRateLimit(intentId)) {
       // Rate limited, drop
       return;
    }

    const taskId = `${intentId}-${Date.now()}`;
    const intent = `Trigger Type: ${triggerType}. Skill Context: ${skill.name}. Event Data: ${JSON.stringify(eventData)}.`;
    
    if (!Config.ENABLE_PROACTIVE_SCHEDULER) {
      console.log(`⏩ [Observer] Event dropped (Proactive disabled): ${skill.name}`);
      return;
    }

    console.log(`🔔 [Observer] Waking up for Sentinel routing: ${skill.name}`);

    if (this.ioInstance) {
      this.ioInstance.emit("agent:progress", { 
        stage: "Sentinel Wake-up", 
        data: { taskId, triggerType, mission: skill.name } 
      });
    }

    try {
      // Phase 3 implementation will route this to SilentAssessmentActor first
      const stream = await MidpointXGraph.stream({
        taskId,
        userIntent: intent,
        proactiveTrigger: { type: triggerType, skill: skill.name, data: eventData }
      }, { 
        recursionLimit: Config.MAX_RECURSION_LIMIT,
        configurable: { thread_id: taskId }
      });

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let lastOutcome = "";

      for await (const chunk of stream) {
        const nodeName = Object.keys(chunk)[0];
        const stateUpdate = (chunk as any)[nodeName];

        if (stateUpdate?.totalInputTokens) totalInputTokens += stateUpdate.totalInputTokens;
        if (stateUpdate?.totalOutputTokens) totalOutputTokens += stateUpdate.totalOutputTokens;
        if (stateUpdate?.finalOutcome) lastOutcome = stateUpdate.finalOutcome;

        if (this.ioInstance && nodeName !== '__end__') {
          this.ioInstance.emit("agent:progress", {
            stage: nodeName,
            data: stateUpdate,
            tokenUsage: { input: totalInputTokens, output: totalOutputTokens }
          });
        }
      }

      if (this.ioInstance && lastOutcome) {
        this.ioInstance.emit("agent:message", { message: `[Sentinel Task Complete] ${skill.name}: ${lastOutcome}` });
      }
      
      console.log(`✅ [Observer] Event processing complete: ${skill.name}`);
    } catch (err: any) {
      console.error(`❌ [Observer] Event processing failed: ${skill.name}`, err);
      if (this.ioInstance) {
        this.ioInstance.emit("agent:error", { 
          message: `Sentinel Fault: ${skill.name}`, 
          error: String(err.message || err) 
        });
      }
    }
  }

  private static registerSleepCycle() {
    console.log(`💤 [Observer] Registering Sleep Cycle [${Config.SLEEP_CYCLE_CRON}]`);
    cron.schedule(Config.SLEEP_CYCLE_CRON, async () => {
      await this.executeSleepCycle();
    });
  }

  public static async executeSleepCycle() {
    console.log("💤 [SleepCycle] Starting background maintenance...");
    
    if (this.ioInstance) {
      this.ioInstance.emit("agent:progress", { 
        stage: "Sleep Cycle", 
        data: { status: "Synaptic Pruning & Memory Consolidation" } 
      });
    }

    try {
      await MemoryManager.rotateSessionLogs();
      const dummyState: any = { pruningTrace: "" };
      const pruningResult = await pruningNode(dummyState);
      
      console.log(`💤 [SleepCycle] Maintenance Outcome: ${pruningResult.pruningTrace}`);
      if (this.ioInstance) {
        this.ioInstance.emit("agent:message", { message: `[Sleep Cycle Complete] ${pruningResult.pruningTrace}` });
      }
      console.log("💤 [SleepCycle] Maintenance complete. House is clean.");
    } catch (err) {
      console.error("❌ [SleepCycle] Maintenance fault:", err);
    }
  }
}
