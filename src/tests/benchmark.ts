import { A2AProtocol } from "../core/protocol";
import { performance } from "perf_hooks";

/**
 * BENCHMARK SUITE: A2A Protocol Latency
 * Measures the overhead of the formal handshake and cryptographic hashing.
 */
async function runBenchmarks() {
  console.log("📊 [Benchmark] Measuring A2A Protocol Overhead...");

  const iterations = 100;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    A2AProtocol.commit("BenchmarkNode", { 
      iteration: i, 
      payload: "Small state update to measure hashing speed" 
    });
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;

  console.log("\n-------------------------------------------");
  console.log(`Total Iterations: ${iterations}`);
  console.log(`Total Time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average Latency per Handshake: ${avgTime.toFixed(4)}ms`);
  console.log("-------------------------------------------");

  if (avgTime < 5) {
    console.log("✅ PERFORMANCE: Handshake latency is well within production limits (< 5ms).");
  } else {
    console.warn("⚠️ PERFORMANCE: Handshake latency is higher than expected. Consider optimizing hashing.");
  }
}

runBenchmarks().catch(console.error);
