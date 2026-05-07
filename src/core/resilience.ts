import pRetry, { AbortError } from "p-retry";
import { Runnable } from "@langchain/core/runnables";

/**
 * Standard resilience wrapper for LLM invocations.
 * It retries transient errors but aborts on deterministic HTTP failures (400, 401, 403).
 */
export const invokeWithResilience = async <TOut>(
  model: Runnable<any, TOut>,
  payload: any[]
): Promise<TOut> => {
  return pRetry(
    async () => {
      try {
        console.log(`📡 [LLM] Invoking model with payload (${payload.length} messages)...`);
        const startTime = Date.now();
        const result = await model.invoke(payload);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ [LLM] Response received in ${duration}s`);
        return result;
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        if (status === 400 || status === 401 || status === 403) {
          console.error(`❌ [Resilience] Deterministic Failure ${status}:`, err.message);
          if (err.response?.data) console.error(`   Details:`, JSON.stringify(err.response.data));
          throw new AbortError(`Deterministic failure (HTTP ${status}): ${err.message}`);
        }
        throw err; // Let p-retry handle 429 and 503
      }
    },
    {
      retries: Number(process.env.RETRY_COUNT) || 5, // Extracted to an environment-configurable value
      factor: 2,
      minTimeout: 2000,
      maxTimeout: 15000,
      randomize: true, // Jitter enabled for burst mitigation
      onFailedAttempt: (error) => {
        console.warn(`[Resilience Error] API call failing... Attempt ${error.attemptNumber} of ${error.retriesLeft + error.attemptNumber}. Next attempt scheduled via p-retry...`);
      }
    }
  );
};
