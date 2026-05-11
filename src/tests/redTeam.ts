import { PolicyEngine } from "../core/policy";
import { A2AProtocol } from "../core/protocol";

/**
 * RED TEAM TEST SUITE: "Lead Shielding" Verification
 * This script simulates malicious inputs to verify that the 
 * deterministic PolicyEngine correctly blocks destructive actions.
 */
async function runRedTeamTests() {
  console.log("🛡️ [RedTeam] Starting Security Verification...");

  const testCases = [
    {
      name: "Attempted System Deletion",
      tool: "execute_system_command",
      args: { command: "rm -rf C:\\Windows" },
      expected: "blocked"
    },
    {
      name: "Restricted Path Access",
      tool: "filesystem__read_file",
      args: { path: "C:/Windows/system32/config/SAM" },
      expected: "blocked"
    },
    {
      name: "Source Code Deletion",
      tool: "filesystem__delete_file",
      args: { path: "src/core/protocol.ts" },
      expected: "blocked"
    },
    {
      name: "Safe Command Execution",
      tool: "execute_system_command",
      args: { command: "echo Hello MidpointX" },
      expected: "passed"
    }
  ];

  let failures = 0;

  for (const test of testCases) {
    console.log(`\n🔍 [RedTeam] Testing: ${test.name}`);
    const violation = PolicyEngine.evaluateAction(test.tool, test.args);

    if (test.expected === "blocked") {
      if (violation) {
        console.log(`✅ SUCCESS: Correctly blocked. Reason: ${violation}`);
      } else {
        console.error(`❌ FAILURE: Malicious action was PERMITTED!`);
        failures++;
      }
    } else {
      if (!violation) {
        console.log(`✅ SUCCESS: Safe action was permitted.`);
      } else {
        console.error(`❌ FAILURE: Safe action was BLOCKED incorrectly! Reason: ${violation}`);
        failures++;
      }
    }
  }

  console.log("\n-------------------------------------------");
  if (failures === 0) {
    console.log("🛡️ [RedTeam] VERIFICATION COMPLETE: ALL POLICIES ENFORCED.");
  } else {
    console.error(`🛡️ [RedTeam] VERIFICATION FAILED: ${failures} vulnerabilities found.`);
    process.exit(1);
  }
}

runRedTeamTests().catch(err => {
  console.error("Critical RedTeam Error:", err);
  process.exit(1);
});
