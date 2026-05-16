import { Config } from "./config";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { Runnable } from "@langchain/core/runnables";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessageChunk } from "@langchain/core/messages";

export class LLMFactory {
  /**
   * Generates the normalized LangChain Chat Model interface based on centralized config.
   * Provider-specific thinking kwargs are injected at construction time (LangChain v1.x pattern).
   */
  static getModel(options?: { temperature?: number, tier?: "expert" | "worker", maxTokens?: number }): Runnable<BaseLanguageModelInput, AIMessageChunk, any> {
    const provider = Config.ACTIVE_LLM_PROVIDER;
    const tier = options?.tier || "expert";
    const maxTokens = options?.maxTokens || (tier === "worker" ? 512 : 8192);
    
    // Select model name based on tier
    const modelName = tier === "worker" 
      ? Config.WORKER_MODEL_NAME
      : Config.ACTIVE_MODEL_NAME;

    const temperature = options?.temperature ?? 0.1;

    switch (provider.toLowerCase()) {
      case "anthropic": {
        // Claude 3.7+: thinking injected at initialization level
        return new ChatAnthropic({
          apiKey: Config.ANTHROPIC_API_KEY,
          model: modelName,
          temperature: temperature,
          maxTokens: maxTokens,
          thinking: { type: "enabled", budget_tokens: 32000 } as any
        });
      }

      case "openrouter": {
        // OpenRouter: uses OpenAI-compatible interface with hijacked baseURL
        return new ChatOpenAI({
          apiKey: Config.OPENROUTER_API_KEY,
          model: modelName,
          temperature: temperature,
          maxTokens: maxTokens,
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
          temperature: temperature,
          maxTokens: maxTokens,
          configuration: {
            baseURL: "https://integrate.api.nvidia.com/v1",
          }
        });
      }

      case "openai": {
        return new ChatOpenAI({
          apiKey: Config.OPENAI_API_KEY,
          model: modelName,
          temperature: temperature,
          maxTokens: maxTokens,
        });
      }

      case "local": {
        // Ollama: uses OpenAI-compatible interface by default on port 11434
        return new ChatOpenAI({
          apiKey: "ollama", // Placeholder as it's not required
          model: modelName,
          temperature: temperature,
          maxTokens: maxTokens,
          timeout: 300000, // 5 min timeout for local model weights loading
          configuration: {
            baseURL: "http://localhost:11434/v1",
          }
        });
      }

      case "vertex": {
        return new ChatVertexAI({
          model: modelName,
          temperature: temperature,
          maxOutputTokens: maxTokens,
        } as any);
      }

      case "google":
      default: {
        // Gemini 2.5+: thinkingConfig enabled but thoughts NOT included in output
        // include_thoughts:true causes the model to return a mixed array of parts
        // which breaks content parsing and structured output parsers
        return new ChatGoogleGenerativeAI({
          apiKey: Config.GEMINI_API_KEY,
          model: modelName,
          temperature: temperature,
          maxOutputTokens: maxTokens,
        });
      }
    }
  }
}
