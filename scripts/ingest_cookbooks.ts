import fs from 'fs';
import path from 'path';

const REPO_PATH = path.resolve(__dirname, '../knowledge/claude-cookbooks');
const SKILLS_DIR = path.resolve(__dirname, '../src/plugins/skills');
const OUTPUT_FILE = path.join(SKILLS_DIR, 'claude_cookbooks.md');

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('.git') && !file.includes('node_modules')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.md') || file.endsWith('.ipynb')) {
        results.push(file);
      }
    }
  });
  return results;
}

function generateIndex() {
  console.log('📖 [Ingestion] Indexing Claude Cookbooks...');
  const files = walk(REPO_PATH);
  
  let markdown = `---
name: claude_cookbooks
description: Deep-knowledge index of Anthropic Claude patterns, recipes, and capabilities.
---

# 📚 Claude Cookbooks Reference Index

This skill provides a directory of advanced Claude implementation patterns. When you encounter a task involving complex Anthropic API usage, reference this index and use \`execute_system_command\` to read the specific implementation files.

## 📂 Knowledge Base Root
Path: \`knowledge/claude-cookbooks/\`

## 🧱 Pattern Map
`;

  const categories: Record<string, string[]> = {};

  files.forEach(file => {
    const relativePath = path.relative(REPO_PATH, file);
    const parts = relativePath.split(path.sep);
    if (parts.length > 1) {
      const cat = parts[0];
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(relativePath);
    }
  });

  for (const [cat, items] of Object.entries(categories)) {
    // Skip noisy dirs
    if (['.github', 'images', 'scripts', 'tests'].includes(cat)) continue;

    markdown += `\n### 📁 ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
    items.slice(0, 15).forEach(item => {
      markdown += `- \`${item}\`\n`;
    });
    if (items.length > 15) {
      markdown += `- ... and ${items.length - 15} more files.\n`;
    }
  }

  markdown += `
\n## 🔍 How to use
1. Find a relevant file in the list above.
2. Read the full content using: \`cat knowledge/claude-cookbooks/<path_to_file>\`
3. Synthesize the logic into your current task.
`;

  fs.writeFileSync(OUTPUT_FILE, markdown, 'utf-8');
  console.log(`✅ [Ingestion] Skill created at: ${OUTPUT_FILE}`);
}

generateIndex();
