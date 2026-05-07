import { PluginRegistry } from "../core/pluginRegistry";

async function testTools() {
  console.log("Initializing Plugin Registry...");
  await PluginRegistry.init();
  const tools = PluginRegistry.getActiveTools();
  
  console.log(`\nSuccessfully loaded ${tools.length} total tools!\n`);
  
  // Group by source:
  const skills = tools.filter((t: any) => t && (t.name === "read_skill" || !t.name.includes("__")));
  const puppeteer = tools.filter((t: any) => t && t.name.startsWith("browser__"));
  const filesystem = tools.filter((t: any) => t && t.name.startsWith("filesystem__"));
  
  console.log(`Markdown Skills: ${skills.length} core tools`);
  if (skills.length > 0) console.log(` - Example: ${skills[0].name}`);

  console.log(`Puppeteer Tools: ${puppeteer.length} active`);
  if (puppeteer.length > 0) console.log(` - Example: ${puppeteer[0].name}`);

  console.log(`Filesystem Tools: ${filesystem.length} active`);
  if (filesystem.length > 0) console.log(` - Example: ${filesystem[0].name}`);
  
  process.exit(0);
}

testTools().catch(console.error);
