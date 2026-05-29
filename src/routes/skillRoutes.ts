import { Router } from "express";
import { PluginRegistry } from "../core/pluginRegistry";
import { PersistenceFactory } from "../core/persistence";

export const skillRoutes = Router();

skillRoutes.get("/", async (req, res) => {
  try {
    res.json(await PluginRegistry.getMDSkills());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

skillRoutes.post("/", async (req, res) => {
  try {
    const { name, description, content } = req.body;
    if (!name || !content) return res.status(400).json({ error: "Missing name or content" });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const adapter = PersistenceFactory.getAdapter();
    const fileContent = `---\nname: ${name}\ndescription: ${description || "Custom skill"}\n---\n\n${content}\n`;
    await adapter.saveSkill(slug, fileContent);
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true, slug });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

skillRoutes.put("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { name, description, content } = req.body;
    const skills = await PluginRegistry.getMDSkills();
    const skill = skills.find(s => s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug);
    if (!skill) return res.status(404).json({ error: "Skill not found" });
    const scheduleMatch = skill.content.match(/schedule:\s*["']?([^"'\s][^"']*)["']?/);
    const schedule = scheduleMatch ? scheduleMatch[1] : undefined;
    let frontmatter = `---\nname: ${name}\ndescription: ${description || "Custom skill"}\n`;
    if (schedule) frontmatter += `schedule: "${schedule}"\n`;
    frontmatter += `---`;
    await PersistenceFactory.getAdapter().saveSkill(slug, `${frontmatter}\n\n${content}\n`);
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

skillRoutes.delete("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    await PersistenceFactory.getAdapter().deleteSkill(slug);
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
