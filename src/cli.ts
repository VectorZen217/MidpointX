import { Config } from "./core/config";
import { MidpointXGraph } from "./core/graph";
import { initContextCache } from "./core/cacheManager";
import { PluginRegistry } from "./core/pluginRegistry";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log(`\n🚀 MidpointX CLI Starting...`);

  try {
    await initContextCache();
    await PluginRegistry.init();
    console.log("🛠️ [System] Core subsystems initialized.\n");
  } catch (err: any) {
    console.error("⛔ [Critical] System initialization failed:", err.message);
    process.exit(1);
  }

  const promptUser = () => {
    rl.question("\n🤖 MidpointX> ", async (input) => {
      if (input.trim().toLowerCase() === "exit" || input.trim().toLowerCase() === "quit") {
        rl.close();
        process.exit(0);
      }

      if (!input.trim()) {
        promptUser();
        return;
      }

      console.log(`\n[Executing task...]`);

      try {
        const stream = await MidpointXGraph.stream({
            taskId: `cli-${Date.now()}`,
            userIntent: input,
            operatorIdentity: null
        }, { recursionLimit: Config.MAX_RECURSION_LIMIT });

        let finalOutcome = "";

        for await (const chunk of stream) {
            const nodeName = Object.keys(chunk)[0];
            const stateUpdate = (chunk as any)[nodeName];

            console.log(`\n--- Node: ${nodeName} ---`);

            // Extract useful state updates without spamming the entire object
            if (stateUpdate?.analysisResult) {
                console.log(`[Analysis]: ${stateUpdate.analysisResult}`);
            }
            if (stateUpdate?.reflectionTrace) {
                console.log(`[Reflection]: ${stateUpdate.reflectionTrace}`);
            }
            if (stateUpdate?.actionHistory && stateUpdate.actionHistory.length > 0) {
                 const lastAction = stateUpdate.actionHistory[stateUpdate.actionHistory.length - 1];
                 if (nodeName === "ActionActor") {
                    console.log(`[Action Taken]: ${lastAction.tool}`);
                 }
            }

            if (stateUpdate?.finalOutcome) {
                finalOutcome = stateUpdate.finalOutcome;
            }
        }

        console.log(`\n✅ Task Complete.`);
        if (finalOutcome) {
             console.log(`\n[Final Outcome]:\n${finalOutcome}`);
        }

      } catch (error: any) {
        console.error(`\n❌ Error executing task: ${error.message}`);
      }

      promptUser();
    });
  };

  promptUser();
}

main().catch(console.error);
