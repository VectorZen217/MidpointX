import { Config, reloadConfig } from "../core/config";
import { PersistenceFactory } from "../core/persistence";
import { SecretProvider } from "../core/secretProvider";

async function runDryRun() {
  console.log("[Readiness] Starting Local Sandbox Dry Run...\n");

  // 1. Environment Validation
  console.log("[Readiness] Step 1: Environment Validation...");
  const requiredEnv = [
    "PERSISTENCE_ADAPTER",
    "ACTIVE_LLM_PROVIDER",
  ];

  let envPassed = true;
  for (const env of requiredEnv) {
    if (!(process.env as any)[env]) {
      console.warn(`   Warning: ${env} is not set. Using defaults.`);
    } else {
      console.log(`   OK: ${env} = ${(process.env as any)[env]}`);
    }
  }

  console.log(`   Provider : ${Config.ACTIVE_LLM_PROVIDER}`);
  console.log(`   Adapter  : ${Config.PERSISTENCE_ADAPTER}`);
  console.log(`   Sandbox  : ${Config.USE_DOCKER_SANDBOX}`);
  console.log(`   Autonomous: ${Config.SANDBOX_AUTONOMOUS_MODE}`);

  // 2. Persistence Factory
  console.log("\n[Readiness] Step 2: Persistence Factory...");
  try {
    const adapter = PersistenceFactory.getAdapter();
    console.log(`   Active Adapter: ${adapter.constructor.name}`);
    if (Config.PERSISTENCE_ADAPTER === "sqlite") {
      console.log("   SQLite mode active — single-file local database.");
    } else {
      console.log("   Local filesystem mode active.");
    }
  } catch (err: any) {
    console.error(`   Persistence Initialization Failed: ${err.message}`);
    envPassed = false;
  }

  // 3. Secret Provider
  console.log("\n[Readiness] Step 3: Secret Provider...");
  try {
    const key = await SecretProvider.get("ACTIVE_LLM_PROVIDER");
    console.log(`   SecretProvider OK — resolved ACTIVE_LLM_PROVIDER: ${key}`);
    console.log("   Cache TTL: 5 minutes");
  } catch (err: any) {
    console.error(`   SecretProvider Failed: ${err.message}`);
    envPassed = false;
  }

  // 4. Sandbox Status
  console.log("\n[Readiness] Step 4: Sandbox Configuration...");
  if (Config.USE_DOCKER_SANDBOX) {
    console.log("   Docker Sandbox: ENABLED — code execution isolated in container.");
    if (Config.SANDBOX_AUTONOMOUS_MODE) {
      console.log("   Autonomous Mode: ENABLED — sandboxed commands skip approval gate.");
    }
  } else {
    console.warn("   Docker Sandbox: DISABLED — running on host shell. Set USE_DOCKER_SANDBOX=true for production.");
  }

  console.log("\n-------------------------------------------");
  if (envPassed) {
    console.log("[Readiness] DRY RUN SUCCESSFUL. MidpointX is ready.");
  } else {
    console.log("[Readiness] DRY RUN COMPLETED WITH WARNINGS. Check environment variables.");
  }
}

runDryRun().catch(console.error);
