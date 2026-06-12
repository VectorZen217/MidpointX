#!/usr/bin/env node
// Blocks direct edits to package-lock.json — must be managed by npm
let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  try {
    const fp = JSON.parse(raw)?.tool_input?.file_path?.replace(/\\/g, '/') || '';
    if (fp.endsWith('package-lock.json')) {
      console.error('BLOCKED: package-lock.json is managed by npm. Run `npm install` or `npm update <pkg>` instead of editing directly.');
      process.exit(2);
    }
  } catch {
    // parse failure — allow through
  }
});
