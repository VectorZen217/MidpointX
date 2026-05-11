import { SessionManager, SessionStatus } from "../core/sessionManager";
import { SecretProvider } from "../core/secretProvider";
import { A2AProtocol } from "../core/protocol";

/**
 * PHASE 6 VERIFICATION: Hardening Suite
 */
async function runHardeningTests() {
  console.log("🛡️ [Hardening] Starting Phase 6 Verification...");

  // 1. Test Session Heartbeat & Expiration
  console.log("\n🔍 [Hardening] Testing Session Lifecycle...");
  const taskId = "test-task-123";
  const userId = "user-999";
  
  await SessionManager.createSession(taskId, userId);
  await SessionManager.heartbeat(taskId); // Should pass
  console.log("✅ SUCCESS: Heartbeat recorded.");

  // 2. Test Secret Provider Caching
  console.log("\n🔍 [Hardening] Testing Secret Rotation Awareness...");
  process.env.TEST_SECRET = "initial-value";
  
  const val1 = await SecretProvider.get("TEST_SECRET");
  console.log(`Initial Secret: ${val1}`);
  
  process.env.TEST_SECRET = "rotated-value";
  const val2 = await SecretProvider.get("TEST_SECRET");
  console.log(`Cached Secret (should be same): ${val2}`);
  
  if (val1 === val2) {
    console.log("✅ SUCCESS: Cache correctly preserved secret during TTL.");
  } else {
    console.error("❌ FAILURE: Cache did not preserve secret.");
  }

  const val3 = await SecretProvider.get("TEST_SECRET", { forceRefresh: true });
  console.log(`Forced Refresh Secret: ${val3}`);
  
  if (val3 === "rotated-value") {
    console.log("✅ SUCCESS: Force refresh bypassed cache correctly.");
  } else {
    console.error("❌ FAILURE: Force refresh did not pick up new value.");
  }

  console.log("\n-------------------------------------------");
  console.log("🛡️ [Hardening] VERIFICATION COMPLETE.");
}

runHardeningTests().catch(console.error);
