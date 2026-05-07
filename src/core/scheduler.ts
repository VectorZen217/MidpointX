import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { MidpointXGraph } from "./graph";
import { PluginRegistry, MDSkill } from "./pluginRegistry";
import { Config } from "./config";
import { Server } from "socket.io";
import { MemoryManager } from "./memory";
import { pruningNode } from "../nodes/pruningNode";

/**
 * Scheduler — The Heartbeat System of MidpointX.
 * It monitors MD Skills for 'schedule' fields and executes them proactively.
 */
export class Scheduler {
  private static jobs: Map<string, ScheduledTask> = new Map();
  private static ioInstance?: Server;

  /**
   * Initializes the scheduler and registers all scheduled skills.
   */
  static async init(io?: Server) {
    console.log("⏰ [Scheduler] Initializing Proactive Heartbeat System...");
    this.ioInstance = io;
    await this.sync();

    // Register the Sleep Cycle (Global Maintenance)
    if (Config.ENABLE_SLEEP_CYCLE) {
      this.registerSleepCycle();
    }
  }

  /**
   * Syncs the current cron jobs with the loaded MD skills.
   * Useful after hot-reloading skills.
   */
  static async sync() {
    console.log("⏰ [Scheduler] Syncing scheduled jobs...");
    const skills = PluginRegistry.getMDSkills();
    
    // Stop and remove jobs that no longer have a schedule or were deleted
    const currentSkillNames = new Set(skills.filter(s => s.schedule).map(s => s.name));
    for (const [name, job] of this.jobs.entries()) {
      if (!currentSkillNames.has(name)) {
        console.log(`⏰ [Scheduler] De-scheduling inactive skill: ${name}`);
        job.stop();
        this.jobs.delete(name);
      }
    }

    // Add or update jobs
    for (const skill of skills) {
      if (skill.schedule) {
        this.scheduleSkill(skill);
      }
    }
  }

  /**
   * Registers a single skill for cron execution.
   */
  private static scheduleSkill(skill: MDSkill) {
    // If job already exists and schedule hasn't changed, skip
    // (We could store the cron string to be more precise, but for now we re-schedule)
    if (this.jobs.has(skill.name)) {
        this.jobs.get(skill.name)?.stop();
    }

    try {
        console.log(`⏰ [Scheduler] Scheduling proactive skill: ${skill.name} [${skill.schedule}]`);
        
        if (!skill.schedule) return;
        const job = cron.schedule(skill.schedule, async () => {
          await this.executeProactiveMission(skill);
        });

        this.jobs.set(skill.name, job);
    } catch (err: any) {
        console.error(`❌ [Scheduler] Invalid cron expression for ${skill.name}: ${skill.schedule}`);
    }
  }

  /**
   * Triggers the MidpointX graph for a proactive mission.
   */
  private static async executeProactiveMission(skill: MDSkill) {
    const taskId = `PROACTIVE-${skill.name}-${Date.now()}`;
    const intent = `PROACTIVE MISSION: ${skill.name}. Execution goal: ${skill.description}`;
    
    if (!Config.ENABLE_PROACTIVE_SCHEDULER) {
      console.log(`⏩ [Scheduler] Proactive mission skipped (Scheduler disabled): ${skill.name}`);
      return;
    }

    console.log(`🔔 [Scheduler] Waking up for mission: ${skill.name}`);

    if (this.ioInstance) {
      this.ioInstance.emit("agent:progress", { 
        stage: "Proactive Wake-up", 
        data: { taskId, intent, mission: skill.name } 
      });
    }

    try {
      const stream = await MidpointXGraph.stream({
        taskId,
        userIntent: intent,
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
        this.ioInstance.emit("agent:message", { message: `[Scheduled Task Complete] ${skill.name}: ${lastOutcome}` });
      }
      
      console.log(`✅ [Scheduler] Proactive mission complete: ${skill.name}`);
    } catch (err: any) {
      console.error(`❌ [Scheduler] Proactive mission failed: ${skill.name}`, err);
      if (this.ioInstance) {
        this.ioInstance.emit("agent:error", { 
          message: `Scheduled Task Fault: ${skill.name}`, 
          error: String(err.message || err) 
        });
      }
    }
  }

  /**
   * Registers the background Sleep Cycle (Maintenance Mode).
   */
  private static registerSleepCycle() {
    console.log(`💤 [Scheduler] Registering Sleep Cycle [${Config.SLEEP_CYCLE_CRON}]`);
    cron.schedule(Config.SLEEP_CYCLE_CRON, async () => {
      await this.executeSleepCycle();
    });
  }

  /**
   * Orchestrates background housekeeping (Pruning & Consolidation).
   */
  public static async executeSleepCycle() {
    console.log("💤 [SleepCycle] Starting background maintenance...");
    
    if (this.ioInstance) {
      this.ioInstance.emit("agent:progress", { 
        stage: "Sleep Cycle", 
        data: { status: "Synaptic Pruning & Memory Consolidation" } 
      });
    }

    try {
      // 1. Memory Consolidation: Merge old session logs
      await MemoryManager.rotateSessionLogs();

      // 2. Synaptic Pruning: Review theorem performance
      // We pass a minimal state object as pruningNode is self-contained for global maintenance
      const dummyState: any = { pruningTrace: "" };
      const pruningResult = await pruningNode(dummyState);
      
      console.log(`💤 [SleepCycle] Maintenance Outcome: ${pruningResult.pruningTrace}`);
      
      if (this.ioInstance) {
        this.ioInstance.emit("agent:message", { 
          message: `[Sleep Cycle Complete] ${pruningResult.pruningTrace}` 
        });
      }
      
      console.log("💤 [SleepCycle] Maintenance complete. House is clean.");
    } catch (err) {
      console.error("❌ [SleepCycle] Maintenance fault:", err);
    }
  }
}
