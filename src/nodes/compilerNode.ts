import { exec } from "child_process";
import { promisify } from "util";
import { MidpointXState } from "../core/state";
import { A2AProtocol } from "../core/protocol";

const execAsync = promisify(exec);

/**
 * NODE 3.5: CompilerActor
 * Validates that the newly modified/synthesized code compiles successfully without errors.
 * If compilation fails, records the trace output and loops back to ModifyActor for automated self-correction.
 */
export async function compilerNode(state: typeof MidpointXState.State) {
  console.log("🧪 [CompilerActor] Running TypeScript compilation verification...");
  
  try {
    // Perform type checking only to keep build directory clean
    await execAsync("npx tsc --noEmit", { cwd: process.cwd() });
    
    console.log("✅ [CompilerActor] Compilation verification passed. Code matches type integrity.");
    
    return A2AProtocol.commit("CompilerActor", {
      needsRecompile: false,
      compilerTrace: ""
    }, state);
  } catch (error: any) {
    const errorOutput = error.stdout || error.stderr || error.message || "Unknown compilation error.";
    console.warn(`🚨 [CompilerActor] Compilation Failed!\n\n${errorOutput}`);
    
    // Set recompile state flag and capture raw compiler stderr/stdout trace
    return A2AProtocol.commit("CompilerActor", {
      needsRecompile: true,
      compilerTrace: errorOutput
    }, state);
  }
}
