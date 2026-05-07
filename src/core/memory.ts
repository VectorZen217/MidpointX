import fs from "fs/promises";
import path from "path";
import { LogicShift } from "./state";

const MEMORY_DIR = path.resolve(__dirname, "../../src/workspace/memory");
const SKILLS_STATS_PATH = path.resolve(__dirname, "../../src/plugins/skills/stats.json");

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

      const skillPath = path.join(__dirname, "../../src/plugins/skills", `${shift.theoremId}.md`);
      await fs.writeFile(skillPath, markdownContent, "utf-8");

      console.log(`✅ [MemoryManager] Logic permanently solidified. New MD Skill created at plugins/skills/${shift.theoremId}.md`);
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
      await fs.mkdir(MEMORY_DIR, { recursive: true });

      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const filePath = path.join(MEMORY_DIR, `${today}.md`);

      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" });
      const tools = toolsUsed.length > 0 ? toolsUsed.join(", ") : "none";
      // Cap outcome length for memory efficiency
      const cappedOutcome = outcome.length > 300 ? outcome.substring(0, 300) + "..." : outcome;

      const entry = `\n## [${now}] ${intent.substring(0, 120)}\n**Task ID:** ${taskId}\n**Outcome:** ${cappedOutcome}\n**Tools used:** ${tools}\n`;

      await fs.appendFile(filePath, entry, "utf-8");
      console.log(`📝 [MemoryManager] Session logged to memory/${today}.md`);
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Failed to log session:`, err);
    }
  }

  /**
   * Searches the last N days of memory logs for entries relevant to the current query.
   * Uses simple term-frequency matching — no external embeddings required.
   * Returns a formatted string suitable for injection into a system prompt.
   */
  static async recallRecent(query: string, maxDays: number = 7): Promise<string> {
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });

      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 3); // Only meaningful words

      if (queryTerms.length === 0) return "";

      const results: Array<{ score: number; entry: string; date: string }> = [];

      for (let i = 0; i < maxDays; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);

        let content: string;
        try {
          content = await fs.readFile(filePath, "utf-8");
        } catch {
          continue; // No log for this day, skip
        }

        // Split by entry blocks (## [...] headers)
        // Improved regex to handle the very first entry which might not have a leading newline
        const entries = content.split(/\n(?=## \[)|^(?=## \[)/m).filter(e => e.trim().length > 10);

        for (const entry of entries) {
          const entryLower = entry.toLowerCase();
          const score = queryTerms.reduce((acc, term) => {
            return acc + (entryLower.includes(term) ? 1 : 0);
          }, 0);

          if (score > 0) {
            results.push({ score, entry: entry.trim(), date: dateStr });
          }
        }
      }

      if (results.length === 0) return "";

      // Sort by relevance, take top 3
      const topResults = results
        .sort((a, b) => b.score - a.score)
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

      let stats: Record<string, any> = {};
      try {
        const data = await fs.readFile(SKILLS_STATS_PATH, "utf-8");
        stats = JSON.parse(data);
      } catch (e) {
        // File doesn't exist, will be created
      }

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

      await fs.writeFile(SKILLS_STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
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
      const data = await fs.readFile(SKILLS_STATS_PATH, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  /**
   * Searches the .archive/ directory for relevant theorems (Long-Term Memory).
   */
  static async searchArchive(query: string): Promise<string> {
    try {
      const skillsDir = path.resolve(__dirname, "../../src/plugins/skills");
      const archiveDir = path.join(skillsDir, ".archive");
      
      try {
        await fs.access(archiveDir);
      } catch {
        return ""; // No archive yet
      }

      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      if (queryTerms.length === 0) return "";

      const entries = await fs.readdir(archiveDir);
      const results: Array<{ score: number; content: string; name: string }> = [];

      for (const entry of entries) {
        // Skip hidden files/directories
        if (entry.startsWith(".")) continue;

        const filePath = path.join(archiveDir, entry);
        const stats = await fs.stat(filePath);
        
        let content = "";
        let name = entry;

        if (stats.isFile() && entry.endsWith(".md")) {
          content = await fs.readFile(filePath, "utf-8");
          name = entry.replace(".md", "");
        } else if (stats.isDirectory()) {
          const skillMD = path.join(filePath, "SKILL.md");
          try {
            content = await fs.readFile(skillMD, "utf-8");
          } catch { continue; }
        } else {
          continue;
        }

        const contentLower = content.toLowerCase();
        const score = queryTerms.reduce((acc, term) => acc + (contentLower.includes(term) ? 1 : 0), 0);
        
        if (score > 0) {
          results.push({ score, content, name });
        }
      }

      if (results.length === 0) return "";

      // Return top 2 matching theorems
      const topResults = results.sort((a, b) => b.score - a.score).slice(0, 2);
      return topResults.map(r => `[ARCHIVED THEOREM: ${r.name}]\n${r.content}`).join("\n\n---\n\n");
    } catch (err) {
      console.warn(`⚠️ [MemoryManager] Archive search failed:`, err);
      return "";
    }
  }

  /**
   * Moves a skill from .archive/ back to active skills/ (Reactivation).
   */
  static async reactivateSkill(skillName: string): Promise<boolean> {
    try {
      const skillsDir = path.resolve(__dirname, "../../src/plugins/skills");
      const archiveDir = path.join(skillsDir, ".archive");
      
      const mdFile = `${skillName}.md`;
      const archivedMd = path.join(archiveDir, mdFile);
      const archivedDir = path.join(archiveDir, skillName);
      
      let source = "";
      let dest = "";

      try {
        await fs.access(archivedMd);
        source = archivedMd;
        dest = path.join(skillsDir, mdFile);
      } catch {
        try {
          await fs.access(archivedDir);
          source = archivedDir;
          dest = path.join(skillsDir, skillName);
        } catch {
          console.warn(`   ⚠️ [MemoryManager] Could not find archived source for: ${skillName}`);
          return false;
        }
      }

      await fs.rename(source, dest);

      // Reset metrics in stats.json
      const stats = await this.getSkillStats();
      stats[skillName] = {
        usageCount: 1, 
        successCount: 1,
        lastUsed: new Date().toISOString()
      };
      await fs.writeFile(SKILLS_STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");

      console.log(`✨ [MemoryManager] Theorem reactivated and restored to active library: ${skillName}`);
      return true;
    } catch (err) {
      console.error(`❌ [MemoryManager] Failed to reactivate skill ${skillName}:`, err);
      return false;
    }
  }

  /**
   * Consolidates older session logs into monthly archives (Memory Consolidation).
   */
  static async rotateSessionLogs(): Promise<void> {
    try {
      const logsDir = path.resolve(__dirname, "../../logs/sessions");
      try {
        await fs.access(logsDir);
      } catch {
        return; // No logs directory yet
      }

      const entries = await fs.readdir(logsDir);
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const archives: Record<string, string[]> = {};

      for (const entry of entries) {
        // Expected format: YYYY-MM-DD.md
        if (!entry.match(/^\d{4}-\d{2}-\d{2}\.md$/)) continue;

        const dateStr = entry.replace(".md", "");
        const fileDate = new Date(dateStr);

        // Only rotate logs older than 7 days
        if (fileDate < sevenDaysAgo) {
          const archiveKey = dateStr.substring(0, 7).replace("-", "_"); // e.g., 2026_04
          if (!archives[archiveKey]) archives[archiveKey] = [];
          archives[archiveKey].push(entry);
        }
      }

      for (const [archiveKey, files] of Object.entries(archives)) {
        const archivePath = path.join(logsDir, `archive_${archiveKey}.md`);
        let archiveContent = "";
        
        try {
          archiveContent = await fs.readFile(archivePath, "utf-8");
          archiveContent += "\n\n--- [APPENDED DURING SLEEP CYCLE] ---\n\n";
        } catch {
          archiveContent = `# Session Archive: ${archiveKey}\n\n`;
        }

        for (const file of files) {
          const filePath = path.join(logsDir, file);
          const content = await fs.readFile(filePath, "utf-8");
          archiveContent += `\n\n## Log: ${file.replace(".md", "")}\n\n${content}`;
          await fs.unlink(filePath);
        }

        await fs.writeFile(archivePath, archiveContent, "utf-8");
        console.log(`💤 [MemoryManager] Deep Consolidation: Merged ${files.length} old logs into [archive_${archiveKey}.md]`);
      }
    } catch (err) {
      console.error("❌ [MemoryManager] Log rotation failed:", err);
    }
  }
}
