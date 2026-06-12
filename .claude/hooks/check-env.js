#!/usr/bin/env node
// Blocks Edit/Write tool calls targeting .env (allows .env.example)
let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const fp = payload?.tool_input?.file_path || payload?.tool_input?.path || '';
    const normalized = fp.replace(/\\/g, '/');
    if (normalized.endsWith('/.env') || normalized === '.env') {
      console.error('BLOCKED: Direct .env edits are disabled. Update .env.example as template and apply changes manually.');
      process.exit(2);
    }
  } catch {
    // parse failure — allow through
  }
});
