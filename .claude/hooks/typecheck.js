#!/usr/bin/env node
// Runs `npx tsc --noEmit` after edits to backend .ts files
const { execSync } = require('child_process');

let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const fp = (payload?.tool_input?.file_path || '').replace(/\\/g, '/');
    const isBackendTs = fp.endsWith('.ts') && fp.includes('src/') && !fp.includes('node_modules');
    if (!isBackendTs) return;

    try {
      execSync('npx tsc --noEmit', { stdio: 'inherit' });
    } catch {
      // tsc exits non-zero on type errors; output already printed to inherit stdio
      process.exit(1);
    }
  } catch {
    // parse failure — skip silently
  }
});
