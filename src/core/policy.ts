import { z } from "zod";

/**
 * Deterministic Policy Engine for MidpointX.
 * This is the "Lead Shielding" that prevents AI hallucinations from causing system damage.
 */
export class PolicyEngine {
  private static DANGEROUS_COMMANDS = [
    /\brm\s+-[rf]+/i,
    /\bdel\b/i,
    /\brd\b/i,
    /\brmdir\b/i,
    /\bformat\b/i,
    /\breg\s+delete\b/i,
    /npx\s+rimraf/i
  ];

  private static PROTECTED_PATHS = [
    /C:[\\\/]+Windows/i,
    /C:[\\\/]+Program Files/i,
    /system32/i,
    /AppData/i,
    /\.ssh/i,
    /\.env/i,
    /\/etc\//i,
    /\/usr\/bin\//i
  ];

  /**
   * Evaluates an action against deterministic safety policies.
   * Returns a rejection reason if the policy is violated, or null if passed.
   */
  static evaluateAction(toolName: string, args: any): string | null {
    const argsString = JSON.stringify(args);

    // 1. Protected Path Check
    if (this.PROTECTED_PATHS.some(pattern => pattern.test(argsString))) {
      return `VIOLATION: Access to protected system path detected in ${toolName}.`;
    }

    // 2. Dangerous Command Check
    if (toolName === "execute_system_command") {
      const command = (args.command || "").toLowerCase();
      if (this.DANGEROUS_COMMANDS.some(pattern => pattern.test(command))) {
        return `VIOLATION: Execution of restricted system command detected: ${command}`;
      }
    }

    // 3. Tool-Specific Restrictions
    if (toolName === "filesystem__delete_file" && args.path?.includes("src/")) {
      return `VIOLATION: Deletion of source code is restricted via automated nodes. Use manual intervention.`;
    }

    return null; // Passed deterministic policy
  }
}
