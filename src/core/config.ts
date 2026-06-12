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
  ACTIVE_LLM_PROVIDER: z.enum(["google", "anthropic", "openai", "openrouter", "local", "nvidia"]).default("anthropic"),
  ACTIVE_MODEL_NAME: z.string(),
  WORKER_MODEL_NAME: z.string(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(5001),
  RETRY_COUNT: z.coerce.number().default(5),
  MAX_RECURSION_LIMIT: z.coerce.number().default(150),
  MAX_TURNS_PER_MISSION: z.coerce.number().default(50),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  TOOL_PROFILE: z.enum(["messaging", "coding", "full"]).default("full"),
  USE_DOCKER_SANDBOX: BoolSchema.default(true),
  REQUIRE_APPROVAL_FOR_DESTRUCTIVE: BoolSchema.default(true),
  ELEVENLABS_API_KEY: z.string().optional(),
  ENABLE_VOICE: BoolSchema.default(false),
  ENABLE_PROACTIVE_SCHEDULER: BoolSchema.default(true),
  ENABLE_SCREENSHOTS: BoolSchema.default(true),
  ENABLE_EMBEDDINGS: BoolSchema.default(false),
  EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  ENABLE_SLEEP_CYCLE: BoolSchema.default(true),
  SLEEP_CYCLE_CRON: z.string().default("0 3 * * *"), // 3 AM local time
  SILENT_MODE: BoolSchema.default(false),
  
  PRIMARY_USER_ID: z.string().optional(), // FIX Bug3: user ID to check for active tasks before proactive triggers
  PERSISTENCE_ADAPTER: z.enum(["local", "sqlite"]).default("local"),
  SANDBOX_AUTONOMOUS_MODE: BoolSchema.default(true),
  // Must be set to enable the /webhook/* endpoint. Min 32 chars enforced.
  WEBHOOK_SECRET: z.string().min(32, "WEBHOOK_SECRET must be at least 32 characters").optional(),
  // Encryption key for credential vault. Min 32 chars enforced.
  CREDENTIAL_VAULT_KEY: z.string().min(32, "CREDENTIAL_VAULT_KEY must be at least 32 characters").optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_DEFAULT_CHANNEL: z.string().default("general"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_DEFAULT_REPO: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export let Config: Config;

export function reloadConfig(newEnv?: any) {
  try {
    Config = ConfigSchema.parse(newEnv || process.env);
    console.log("✅ [Config] Environment variables reloaded successfully.");
    // Invalidate PersistenceFactory singleton so next getAdapter() uses the updated config.
    // Inline require avoids a circular dependency (persistence.ts imports config.ts).
    const { PersistenceFactory } = require("./persistence");
    PersistenceFactory.reset();
  } catch (error: any) {
    console.error("❄ [Config] Configuration reload failed:");
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
  console.log("℅ [Config] Environment variables validated successfully.");
} catch (error: any) {
  console.error("❄ [Config] Configuration validation failed:");
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => {
      console.error(`   - ${err.path.join(".")}: ${err.message}`);
    });
  } else {
    console.error(error.message);
  }
  process.exit(1);
}
