import { LogicShift } from "./state";
import { PersistenceFactory } from "./persistence";

/**
 * MemoryManager — handles both permanent theorem storage and rolling session memory logs.
 */
export class MemoryManager {
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
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Failed to log session:`, err);
    }
  }

  /**
   * Searches the last N days of memory logs for entries relevant to the current query.
   * Now delegated to the PersistenceAdapter.
   */
  static async recallRecent(query: string, maxDays: number = 7): Promise<string> {
    try {
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 3);

      if (queryTerms.length === 0) return "";

      const adapter = PersistenceFactory.getAdapter();
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
   * Searches the .archive/ directory for relevant theorems (Long-Term Memory).
   * Now uses the PersistenceAdapter.
   */
  static async searchArchive(query: string): Promise<string> {
    try {
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      if (queryTerms.length === 0) return "";

      const adapter = PersistenceFactory.getAdapter();
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
