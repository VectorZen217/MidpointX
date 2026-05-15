import "dotenv/config";
import { z } from "zod";

/**
 * Centralized Configuration Schema
 * Ensures all required environment variables are present and valid on boot.
 */
const BoolSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
  }
  return val;
}, z.coerce.boolean());

const ConfigSchema = z.object({
  ACTIVE_LLM_PROVIDER: z.enum(["google", "anthropic", "openai", "openrouter", "local"]).default("google"),
  ACTIVE_MODEL_NAME: z.string(),
  WORKER_MODEL_NAME: z.string(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(5001),
  RETRY_COUNT: z.coerce.number().default(5),
  MAX_RECURSION_LIMIT: z.coerce.number().default(150),
  MAX_TURNS_PER_MISSION: z.coerce.number().default(50),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  TOOL_PROFILE: z.enum(["messaging", "coding", "full"]).default("full"),
  USE_DOCKER_SANDBOX: BoolSchema.default(false),
  REQUIRE_APPROVAL_FOR_DESTRUCTIVE: BoolSchema.default(true),
  ELEVENLABS_API_KEY: z.string().optional(),
  ENABLE_VOICE: BoolSchema.default(false),
  ENABLE_PROACTIVE_SCHEDULER: BoolSchema.default(true),
  ENABLE_SCREENSHOTS: BoolSchema.default(true),
  ENABLE_EMBEDDINGS: BoolSchema.default(false),
  EMBEDDING_MODEL: z.string().default("text-embedding-004"),
  ENABLE_SLEEP_CYCLE: BoolSchema.default(true),
  SLEEP_CYCLE_CRON: z.string().default("0 3 * * *"), // 3 AM local time
  SILENT_MODE: BoolSchema.default(false),
  
  // GCP Native Integration (Phase 4)
  GCP_PROJECT_ID: z.string().optional(),
  GCP_LOCATION: z.string().default("us-central1"),
  ENABLE_CLOUD_LOGGING: BoolSchema.default(false),
  PERSISTENCE_ADAPTER: z.enum(["local", "firestore"]).default("local"),
});

export type Config = z.infer<typeof ConfigSchema>;
export let Config: Config;

export function reloadConfig(newEnv?: any) {
  try {
    Config = ConfigSchema.parse(newEnv || process.env);
    console.log("✅ [Config] Environment variables reloaded successfully.");
  } catch (error: any) {
    console.error("❌ [Config] Configuration reload failed:");
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`   - ${err.path.join(".")}: ${err.message}`);
      });
    }
  }
}

// Initial load
try {
  Config = ConfigSchema.parse(process.env);
  console.log("✅ [Config] Environment variables validated successfully.");
} catch (error: any) {
  console.error("❌ [Config] Configuration validation failed:");
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => {
      console.error(`   - ${err.path.join(".")}: ${err.message}`);
    });
  } else {
    console.error(error.message);
  }
  process.exit(1);
}

