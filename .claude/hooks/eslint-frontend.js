#!/usr/bin/env node
// Runs ESLint on the edited frontend file after each Edit/Write
const { execSync } = require('child_process');
const path = require('path');

let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const fp = (payload?.tool_input?.file_path || '').replace(/\\/g, '/');
    const isFrontendSrc = fp.includes('frontend/src/') && /\.(tsx?|jsx?)$/.test(fp);
    if (!isFrontendSrc) return;

    const frontendDir = path.join(process.cwd(), 'frontend');
    try {
      execSync(`npx eslint --max-warnings=0 "${fp}"`, { cwd: frontendDir, stdio: 'inherit' });
    } catch {
      process.exit(1);
    }
  } catch {
    // parse failure — skip
  }
});
