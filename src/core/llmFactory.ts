import { Config } from "./config";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export class LLMFactory {
  private static _cache = new Map<string, BaseChatModel>();

  static getModel(options?: {
    temperature?: number;
    tier?: "expert" | "worker";
    maxTokens?: number;
    modelName?: string;
  }): BaseChatModel {
    const provider = Config.ACTIVE_LLM_PROVIDER;
    const tier = options?.tier ?? "expert";
    const maxTokens = options?.maxTokens ?? (tier === "worker" ? 512 : 8192);
    const modelName = options?.modelName ?? (tier === "worker" ? Config.WORKER_MODEL_NAME : Config.ACTIVE_MODEL_NAME);
    const temperature = options?.temperature ?? 0.1;

    const cacheKey = `${provider}|${modelName}|${temperature}|${maxTokens}`;
    const cached = LLMFactory._cache.get(cacheKey);
    if (cached) return cached;

    const instance = (() => {
      switch (provider.toLowerCase()) {
        case "anthropic": {
          return new ChatAnthropic({
            apiKey: Config.ANTHROPIC_API_KEY,
            model: modelName,
            temperature,
            maxTokens,
            // Extended thinking only on expert tier; budget_tokens must be < maxTokens
            ...(tier === "expert" ? { thinking: { type: "enabled", budget_tokens: 8000 } } as any : {})
          });
        }

        case "openrouter": {
          // OpenRouter: uses OpenAI-compatible interface with hijacked baseURL
          return new ChatOpenAI({
            apiKey: Config.OPENROUTER_API_KEY,
            model: modelName,
            temperature,
            maxTokens,
            configuration: {
              baseURL: "https://openrouter.ai/api/v1",
            }
          });
        }

        case "nvidia": {
          // NVIDIA NIM: OpenAI-compatible interface
          return new ChatOpenAI({
            apiKey: Config.NVIDIA_API_KEY,
            model: modelName,
            temperature,
            maxTokens,
            configuration: {
              baseURL: "https://integrate.api.nvidia.com/v1",
            }
          });
        }

        case "openai": {
          return new ChatOpenAI({
            apiKey: Config.OPENAI_API_KEY,
            model: modelName,
            temperature,
            maxTokens,
          });
        }

        case "local": {
          // Ollama: uses OpenAI-compatible interface by default on port 11434
          return new ChatOpenAI({
            apiKey: "ollama",
            model: modelName,
            temperature,
            maxTokens,
            timeout: 300000, // 5 min timeout for local model weights loading
            configuration: {
              baseURL: "http://localhost:11434/v1",
            }
          });
        }

        case "google": {
          // Gemini via direct Google AI API (no Vertex, no Cloud infra)
          return new ChatGoogleGenerativeAI({
            apiKey: Config.GEMINI_API_KEY,
            model: modelName,
            temperature,
            maxOutputTokens: maxTokens,
          });
        }

        default: {
          throw new Error(
            `[LLMFactory] Unknown provider: "${provider}". Valid options: google, anthropic, openai, openrouter, nvidia, local`
          );
        }
      }
    })();

    LLMFactory._cache.set(cacheKey, instance);
    return instance;
  }
}
