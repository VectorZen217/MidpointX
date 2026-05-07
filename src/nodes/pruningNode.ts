import { MidpointXState } from "../core/state";
import { MemoryManager } from "../core/memory";
import fs from "fs/promises";
import path from "path";

/**
 * NODE: PruningActor (Entropy Manager)
 * Evaluates the permanent skill library against usage and success metrics.
 * Archives stale (unused > 30d) or ineffective (success < 50%) skills.
 */
export async function pruningNode(state: typeof MidpointXState.State) {
  console.log("🧹 [PruningActor] Evaluating theorem library for entropy...");

  const SKILLS_DIR = path.resolve(__dirname, "../../src/plugins/skills");
  const ARCHIVE_DIR = path.join(SKILLS_DIR, ".archive");
  
  const stats = await MemoryManager.getSkillStats();
  const skills = Object.keys(stats);
  
  if (skills.length === 0) {
    console.log("   No metrics recorded yet. Skipping pruning.");
    return {};
  }

  const STALENESS_THRESHOLD_DAYS = 30;
  const SUCCESS_RATE_THRESHOLD = 0.5;
  const MIN_USES_FOR_EVAL = 5;

  const toArchive: string[] = [];
  const now = new Date();

  for (const name of skills) {
    const entry = stats[name];
    const lastUsed = new Date(entry.lastUsed);
    const daysSinceUse = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    
    // 1. Staleness Check
    if (daysSinceUse > STALENESS_THRESHOLD_DAYS) {
      console.log(`   📉 Skill [${name}] is stale (${Math.floor(daysSinceUse)} days since last use).`);
      toArchive.push(name);
      continue;
    }

    // 2. Incompetence Check
    if (entry.usageCount >= MIN_USES_FOR_EVAL) {
      const successRate = entry.successCount / entry.usageCount;
      if (successRate < SUCCESS_RATE_THRESHOLD) {
        console.log(`   ⚠️ Skill [${name}] is ineffective (Success rate: ${(successRate * 100).toFixed(1)}%).`);
        toArchive.push(name);
      }
    }
  }

  if (toArchive.length === 0) {
    console.log("   Library is lean and effective. No pruning required.");
    return { pruningTrace: "No skills pruned." };
  }

  // Execute Archival
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  let prunedCount = 0;

  for (const skillName of toArchive) {
    try {
      // Find the file (could be .md or a folder with SKILL.md)
      const mdPath = path.join(SKILLS_DIR, `${skillName}.md`);
      const dirPath = path.join(SKILLS_DIR, skillName);
      
      let sourcePath = "";
      try {
        await fs.access(mdPath);
        sourcePath = mdPath;
      } catch {
        try {
          await fs.access(dirPath);
          sourcePath = dirPath;
        } catch {
          console.warn(`   ⚠️ Could not find file/dir for skill: ${skillName}`);
          continue;
        }
      }

      const destPath = path.join(ARCHIVE_DIR, path.basename(sourcePath));
      await fs.rename(sourcePath, destPath);
      prunedCount++;
      console.log(`   ✅ Archived: ${skillName}`);
      
      // Remove from stats once archived
      delete stats[skillName];
    } catch (err) {
      console.error(`   ❌ Failed to archive ${skillName}:`, err);
    }
  }

  // Save updated stats (without pruned items)
  const SKILLS_STATS_PATH = path.join(SKILLS_DIR, "stats.json");
  await fs.writeFile(SKILLS_STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");

  const resultMsg = `Archived ${prunedCount} skill(s): ${toArchive.join(", ")}`;
  console.log(`🧹 [PruningActor] Done. ${resultMsg}`);

  return {
    pruningTrace: resultMsg
  };
}
