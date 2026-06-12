#!/usr/bin/env node
// Emits a warning when graph.ts is edited — the `as any` cast means
// mistyped node names in addEdge/addConditionalEdges are silently ignored by tsc
let raw = '';
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  try {
    const fp = JSON.parse(raw)?.tool_input?.file_path?.replace(/\\/g, '/') || '';
    if (fp.endsWith('src/core/graph.ts')) {
      console.log('[graph.ts] WARNING: The StateGraph builder is cast to `as any`. TypeScript will NOT catch mistyped node names in addEdge() or addConditionalEdges() calls. After editing, verify every node name string matches a builder.addNode() registration exactly.');
    }
    // exit 0 — warn only, do not block
  } catch {
    // parse failure — allow through
  }
});
