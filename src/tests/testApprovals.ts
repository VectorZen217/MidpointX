import * as os from "os";

function isDestructiveAction(toolName: string, args: any): boolean {
  const destructiveTools = [
    "filesystem__delete_file",
    "mcp_GitKraken_git_push",
    "mcp_GitKraken_git_add_or_commit"
  ];

  if (destructiveTools.includes(toolName)) return true;

  const sensitivePathPatterns = [
    /C:[\\\/]+Windows/i,
    /C:[\\\/]+Program Files/i,
    /system32/i,
    /AppData/i,
    /\.ssh/i,
    /\.env/i
  ];

  // Check arguments for sensitive paths
  const argsString = JSON.stringify(args);
  if (sensitivePathPatterns.some(pattern => pattern.test(argsString))) {
    console.log(`🚩 Sensitive path detected in args: ${argsString}`);
    return true;
  }

  if (toolName === "execute_system_command") {
    const command = (args.command || "").toLowerCase();
    const dangerousCommands = [
      /\brm\s+-[rf]+/i,
      /\bdel\b/i,
      /\brd\b/i,
      /\brmdir\b/i,
      /\bformat\b/i,
      /\breg\s+delete\b/i,
      /npx\s+rimraf/i
    ];

    if (dangerousCommands.some(pattern => pattern.test(command))) {
      console.log(`🚩 Dangerous command detected: ${command}`);
      return true;
    }
  }

  return false;
}

// Test cases
const tests = [
  { tool: "execute_system_command", args: { command: "echo hello" }, expected: false },
  { tool: "execute_system_command", args: { command: "ls -la" }, expected: false },
  { tool: "execute_system_command", args: { command: "rm -rf test_dir" }, expected: true },
  { tool: "execute_system_command", args: { command: "del test.txt" }, expected: true },
  { tool: "execute_system_command", args: { command: "type C:\\Windows\\System32\\drivers\\etc\\hosts" }, expected: true },
  { tool: "filesystem__write_text_file", args: { path: "test.txt", content: "hello" }, expected: false },
  { tool: "filesystem__write_text_file", args: { path: "C:\\Windows\\test.txt", content: "hello" }, expected: true },
  { tool: "filesystem__write_text_file", args: { path: os.homedir() + "\\AppData\\Local\\test.txt", content: "hello" }, expected: true },
  { tool: "filesystem__delete_file", args: { path: "test.txt" }, expected: true },
  { tool: "mcp_GitKraken_git_push", args: {}, expected: true },
];

console.log("🧪 Running Approval Logic Tests...\n");
let passed = 0;
tests.forEach((t, i) => {
  const result = isDestructiveAction(t.tool, t.args);
  const status = result === t.expected ? "✅ PASSED" : "❌ FAILED";
  if (result === t.expected) passed++;
  console.log(`${i + 1}. [${t.tool}] -> ${status} (Result: ${result}, Expected: ${t.expected})`);
  if (t.args.command) console.log(`   Cmd: ${t.args.command}`);
  if (t.args.path) console.log(`   Path: ${t.args.path}`);
});

console.log(`\n📊 Summary: ${passed}/${tests.length} tests passed.`);
