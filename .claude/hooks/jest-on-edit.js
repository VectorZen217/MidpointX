#!/usr/bin/env node
// Runs the specific Jest test file whenever a *.test.ts file is edited
const { execSync } = require('child_process');

let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const fp = (payload?.tool_input?.file_path || '').replace(/\\/g, '/');
    if (!fp.endsWith('.test.ts')) return;

    try {
      // Pass the absolute path directly — Jest accepts file paths as positional args
      execSync(`npx jest "${fp}" --no-coverage --passWithNoTests`, { stdio: 'inherit' });
    } catch {
      process.exit(1);
    }
  } catch {
    // parse failure — skip
  }
});
