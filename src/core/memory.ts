import { LogicShift } from "./state";
import { PersistenceFactory } from "./persistence";
import { Config } from "./config";

/**
 * MemoryManager — handles both permanent theorem storage and rolling session memory logs.
 */
export class MemoryManager {
  // Trigger Ledger for Semantic Rate Limiting (The 3:15 Rule)
  // Maps intent string to an array of timestamps (Date.now())
  private static triggerLedger: Map<string, number[]> = new Map();

  /**
   * Generates a vector embedding for the target text using text-embedding-004.
   */
  private static async getEmbedding(text: string): Promise<number[] | null> {
    if (!Config.ENABLE_EMBEDDINGS) return null;
    try {
      const { GoogleGenerativeAIEmbeddings } = await import("@langchain/google-genai");
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: Config.GEMINI_API_KEY,
        modelName: Config.EMBEDDING_MODEL || "text-embedding-004",
      });
      return await embeddings.embedQuery(text);
    } catch (e) {
      console.warn("⚠️ [MemoryManager] Failed to generate embedding:", e);
      return null;
    }
  }

  /**
   * Checks if a proactive trigger intent has exceeded the 3:15 rule.
   * Returns true if rate limited (should be dropped), false otherwise.
   */
  static checkTriggerRateLimit(intent: string): boolean {
    const now = Date.now();
    const fifteenMinutesMs = 15 * 60 * 1000;
    
    let timestamps = this.triggerLedger.get(intent) || [];
    // Filter out timestamps older than 15 minutes
    timestamps = timestamps.filter(ts => now - ts <= fifteenMinutesMs);
    
    if (timestamps.length >= 3) {
      console.warn(`⚠️ [MemoryManager] Semantic Rate Limit Exceeded for intent: "${intent}". (Fired ${timestamps.length} times in last 15 mins).`);
      return true;
    }
    
    timestamps.push(now);
    this.triggerLedger.set(intent, timestamps);
    return false;
  }

  /**
   * Commits a newly validated theorem directly as a Local MD Skill.
   */
  static async commitTheorem(shift: LogicShift, traceId: string): Promise<boolean> {
    try {
      console.log(`💾 [MemoryManager] Committing Theorem as new Skill: ${shift.theoremId}`);

      const markdownContent = `---
name: ${shift.theoremId}
description: ${shift.conceptualTags.join(', ')}
---

# Logic Shift: ${shift.theoremId}
Trace ID: ${traceId}
Learned At: ${new Date().toISOString()}

## Justification
${shift.justification}

## Discovered Pattern
${shift.pattern}

## Optimized Approach
${shift.optimization}
`;

      const adapter = PersistenceFactory.getAdapter();
      await adapter.saveSkill(shift.theoremId, markdownContent);

      console.log(`✅ [MemoryManager] Logic permanently solidified via PersistenceAdapter.`);

      // Generate & save semantic embedding index
      const textToEmbed = `${shift.theoremId} ${shift.conceptualTags.join(' ')} ${shift.justification} ${shift.pattern} ${shift.optimization}`;
      const vector = await this.getEmbedding(textToEmbed);
      if (vector) {
        await adapter.saveVectorIndex("skills", shift.theoremId, vector, { theoremId: shift.theoremId, justification: shift.justification });
        console.log(`🔮 [MemoryManager] Skill embedding index stored.`);
      }

      return true;

    } catch (error) {
      console.error(`❌ [MemoryManager] Failed to commit theorem:`, error);
      return false;
    }
  }

  /**
   * Appends a structured session entry to today's memory log file.
   * File path: src/workspace/memory/YYYY-MM-DD.md
   */
  static async logSession(taskId: string, intent: string, outcome: string, toolsUsed: string[]): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" });
      const tools = toolsUsed.length > 0 ? toolsUsed.join(", ") : "none";
      const cappedOutcome = outcome.length > 300 ? outcome.substring(0, 300) + "..." : outcome;

      const entry = `\n## [${now}] ${intent.substring(0, 120)}\n**Task ID:** ${taskId}\n**Outcome:** ${cappedOutcome}\n**Tools used:** ${tools}\n`;

      const adapter = PersistenceFactory.getAdapter();
      await adapter.appendLog("memory", today, entry);
      
      console.log(`📝 [MemoryManager] Session logged via PersistenceAdapter.`);

      // Generate & save semantic embedding index
      const vector = await this.getEmbedding(entry);
      if (vector) {
        await adapter.saveVectorIndex("memory", taskId, vector, { intent, outcome: cappedOutcome, tools });
        console.log(`🔮 [MemoryManager] Session embedding index stored.`);
      }
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Failed to log session:`, err);
    }
  }

  /**
   * Logs a completed proactive intervention to the dedicated proactive interventions ledger.
   */
  static async logIntervention(eventSeen: string, workerAssigned: string, reasoning: string, actionTaken: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const entry = `\n## [${now}] Event: ${eventSeen}\n**Worker:** ${workerAssigned}\n**Reasoning:** ${reasoning}\n**Action Taken:** ${actionTaken}\n`;
      
      const adapter = PersistenceFactory.getAdapter();
      await adapter.appendLog("memory", "proactive_interventions", entry);
      
      console.log(`📝 [MemoryManager] Proactive intervention logged.`);
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Failed to log intervention:`, err);
    }
  }

  /**
   * Logs a dropped event to the Dead-Letter Queue (DLQ).
   */
  static async logDroppedEventToDLQ(eventData: any, reasoning: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const eventSummary = typeof eventData === 'string' ? eventData : JSON.stringify(eventData);
      const entry = `\n## [${now}] Dropped Event\n**Event:** ${eventSummary}\n**Reasoning:** ${reasoning}\n`;
      
      const adapter = PersistenceFactory.getAdapter();
      // Using .md extension via appendLog so it works seamlessly with PersistenceAdapter
      await adapter.appendLog("memory", "dropped_events", entry);
      
      console.log(`🗑️ [MemoryManager] Event routed to Dead-Letter Queue (DLQ).`);
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Failed to route to DLQ:`, err);
    }
  }

  /**
   * Searches the last N days of memory logs for entries relevant to the current query.
   * Now delegated to the PersistenceAdapter.
   */
  static async recallRecent(query: string, maxDays: number = 7): Promise<string> {
    try {
      const adapter = PersistenceFactory.getAdapter();

      // Try semantic Vector search first if enabled
      if (Config.ENABLE_EMBEDDINGS) {
        const queryVector = await this.getEmbedding(query);
        if (queryVector) {
          const vectorResults = await adapter.queryVectorIndex("memory", queryVector, 3);
          if (vectorResults.length > 0) {
            console.log(`🔮 [MemoryManager] Semantic recall retrieved ${vectorResults.length} relevant past session(s).`);
            const formatted = vectorResults
              .map(r => `[Semantic Score: ${r.score.toFixed(3)}]\n**Intent:** ${r.metadata.intent}\n**Outcome:** ${r.metadata.outcome}\n**Tools:** ${r.metadata.tools}`)
              .join("\n\n---\n\n");
            return `RELEVANT PAST SESSIONS (Semantic Memory):\n\n${formatted}`;
          }
        }
      }

      // Keyword search fallback
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 3);

      if (queryTerms.length === 0) return "";

      const results = await adapter.searchLogs("memory", queryTerms);

      if (results.length === 0) return "";

      // Sort by score, then date, and take top 3
      const topResults = results
        .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
        .slice(0, 3);

      const formatted = topResults
        .map(r => `[${r.date}]\n${r.entry}`)
        .join("\n\n---\n\n");

      return `RELEVANT PAST SESSIONS (last ${maxDays} days):\n\n${formatted}`;
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Recall failed:`, err);
      return "";
    }
  }

  /**
   * Updates usage and success metrics for cited skills.
   */
  static async updateSkillStats(skillNames: string[], success: boolean): Promise<void> {
    try {
      if (skillNames.length === 0) return;

      const adapter = PersistenceFactory.getAdapter();
      const stats = await adapter.readStats("stats");

      const now = new Date().toISOString();
      for (const name of skillNames) {
        if (!stats[name]) {
          stats[name] = { usageCount: 0, successCount: 0, lastUsed: now };
        }
        stats[name].usageCount += 1;
        stats[name].lastUsed = now;
        if (success) {
          stats[name].successCount += 1;
        }
      }

      await adapter.saveStats("stats", stats);
      console.log(`📊 [MemoryManager] Updated metrics for ${skillNames.length} skill(s).`);
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Failed to update skill stats:`, err);
    }
  }

  /**
   * Retrieves current skill metrics.
   */
  static async getSkillStats(): Promise<Record<string, any>> {
    try {
      const adapter = PersistenceFactory.getAdapter();
      return await adapter.readStats("stats");
    } catch {
      return {};
    }
  }

  /**
   * Logs application usage habits for pattern recognition.
   */
  static async logHabitData(appName: string, windowTitle: string): Promise<void> {
    try {
      const adapter = PersistenceFactory.getAdapter();
      const habits = await adapter.readStats("habits");
      const now = new Date().toISOString();
      const hour = new Date().getHours();

      if (!habits[appName]) {
        habits[appName] = { count: 0, titles: [], hourlyDistribution: {} };
      }

      habits[appName].count += 1;
      habits[appName].lastSeen = now;
      if (!habits[appName].titles.includes(windowTitle)) {
        habits[appName].titles.push(windowTitle);
      }
      habits[appName].hourlyDistribution[hour] = (habits[appName].hourlyDistribution[hour] || 0) + 1;

      await adapter.saveStats("habits", habits);
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Failed to log habit data:`, err);
    }
  }

  /**
   * Retrieves logged habit data.
   */
  static async getHabitData(): Promise<Record<string, any>> {
    try {
      const adapter = PersistenceFactory.getAdapter();
      return await adapter.readStats("habits");
    } catch {
      return {};
    }
  }

  /**
   * Searches the .archive/ directory for relevant theorems (Long-Term Memory).
   * Now uses the PersistenceAdapter.
   */
  static async searchArchive(query: string): Promise<string> {
    try {
      const adapter = PersistenceFactory.getAdapter();

      // Try semantic Vector search first if enabled
      if (Config.ENABLE_EMBEDDINGS) {
        const queryVector = await this.getEmbedding(query);
        if (queryVector) {
          const vectorResults = await adapter.queryVectorIndex("skills", queryVector, 2);
          if (vectorResults.length > 0) {
            console.log(`🔮 [MemoryManager] Semantic archive search retrieved ${vectorResults.length} relevant skill(s).`);
            return vectorResults
              .map(r => `[ARCHIVED THEOREM: ${r.key}] (Semantic Score: ${r.score.toFixed(3)})\n${r.metadata.justification || ''}`)
              .join("\n\n---\n\n");
          }
        }
      }

      // Keyword search fallback
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      if (queryTerms.length === 0) return "";

      const results = await adapter.searchLogs(".archive", queryTerms);

      if (results.length === 0) return "";

      // Return top 2 matching theorems
      const topResults = results.sort((a, b) => b.score - a.score).slice(0, 2);
      return topResults.map(r => `[ARCHIVED THEOREM: ${r.date}]\n${r.entry}`).join("\n\n---\n\n");
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Archive search failed:`, err);
      return "";
    }
  }

  /**
   * Moves a skill from .archive/ back to active skills/ (Reactivation).
   * Now uses the PersistenceAdapter.
   */
  static async reactivateSkill(skillName: string): Promise<boolean> {
    try {
      const adapter = PersistenceFactory.getAdapter();
      const mdFile = `${skillName}.md`;
      
      // Attempt to move MD file or Directory
      await adapter.moveSkill(`.archive/${mdFile}`, mdFile);

      // Reset metrics
      const stats = await this.getSkillStats();
      stats[skillName] = {
        usageCount: 1, 
        successCount: 1,
        lastUsed: new Date().toISOString()
      };
      await adapter.saveStats("stats", stats);

      console.log(`✨ [MemoryManager] Theorem reactivated and restored to active library: ${skillName}`);
      return true;
    } catch (err) {
      console.error(`❌ [MemoryManager] Failed to reactivate skill ${skillName}:`, err);
      return false;
    }
  }

  /**
   * Consolidates older session logs into monthly archives (Memory Consolidation).
   * Now uses the PersistenceAdapter.
   */
  static async rotateSessionLogs(): Promise<void> {
    try {
      const adapter = PersistenceFactory.getAdapter();
      const entries = await adapter.listLogFiles("sessions");
      
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const archives: Record<string, string[]> = {};

      for (const entry of entries) {
        if (!entry.match(/^\d{4}-\d{2}-\d{2}\.md$/)) continue;
        const dateStr = entry.replace(".md", "");
        const fileDate = new Date(dateStr);

        if (fileDate < sevenDaysAgo) {
          const archiveKey = dateStr.substring(0, 7).replace("-", "_");
          if (!archives[archiveKey]) archives[archiveKey] = [];
          archives[archiveKey].push(entry);
        }
      }

      for (const [archiveKey, files] of Object.entries(archives)) {
        let archiveContent = await adapter.readLogs("sessions", `archive_${archiveKey}`);
        if (!archiveContent) {
          archiveContent = `# Session Archive: ${archiveKey}\n\n`;
        } else {
          archiveContent += "\n\n--- [APPENDED DURING SLEEP CYCLE] ---\n\n";
        }

        for (const file of files) {
          const content = await adapter.readLogs("sessions", file.replace(".md", ""));
          archiveContent += `\n\n## Log: ${file.replace(".md", "")}\n\n${content}`;
          await adapter.deleteLog("sessions", file.replace(".md", ""));
        }

        await adapter.saveSkill(`archive_${archiveKey}`, archiveContent); // Or use a specific log archive method
        console.log(`💤 [MemoryManager] Deep Consolidation: Merged ${files.length} old logs into [archive_${archiveKey}.md]`);
      }
    } catch (err) {
      console.error("❌ [MemoryManager] Log rotation failed:", err);
    }
  }
}
