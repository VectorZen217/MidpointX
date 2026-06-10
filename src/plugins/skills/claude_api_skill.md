---
name: CLAUDE_API_SKILL
description: Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration.
---

# Claude API Skill

TRIGGER — read BEFORE opening the target file; don't skip because it "looks like a one-liner" — whenever: the prompt names Claude/Anthropic in any form (Claude, Anthropic, Opus, Sonnet, Haiku, `anthropic`, `@anthropic-ai`, `claude-*`, `us.anthropic.*`, `[1m]`); the user asks about an LLM (pricing/model choice/limits/caching) — never answer from memory; OR the task is LLM-shaped with provider unstated (agent/MCP/tool-definition/multi-agent/RAG/LLM-judge/computer-use; generate/summarize/extract/classify/rewrite/converse over NL; debugging refusals/cutoffs/streaming/tool-calls/tokens).
SKIP only when another provider is being worked on (overrides all triggers): OpenAI/GPT/Gemini/Llama/Mistral/Cohere/Ollama named in the query; OR `grep -rE 'openai|langchain_openai|google.generativeai|genai|mistralai|cohere|ollama'` over the project hits (run this grep FIRST if no provider named — don't Read the file).

## Core Surfaces

1. **Claude API** — Single calls, workflows, and tool use for most applications
2. **Managed Agents** — Server-managed stateful agents with Anthropic-hosted tool execution
3. **Raw HTTP** — cURL/REST when SDKs aren't available

## Current Models

| Model | ID | Context | Price (in/out per 1M tokens) |
|---|---|---|---|
| Claude Fable 5 | `claude-fable-5` | 1M | $10 / $50 |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | $5 / $25 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 1M | $3 / $15 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1 / $5 |

**Always use Opus 4.8 unless explicitly requested otherwise.**

## Key API Concepts

### Thinking & Effort
- Fable 5, Opus 4.8/4.7 — Adaptive thinking only (`thinking: {type: "adaptive"}`)
- Effort parameter controls depth: `low` / `medium` / `high` / `xhigh` / `max`
- Task budgets available for agentic loops (beta)

### Prompt Caching
- Prefix matching; `cache_control: {type: "ephemeral"}` for auto-caching
- Keep stable content first (system prompt, tools), volatile content after cache breakpoint
- Verify with `usage.cache_read_input_tokens`

### Compaction (beta)
- Automatic summarization for long conversations approaching 1M context window
- Beta header `compact-2026-01-12` required
- Always append `response.content` (not just text) back to messages

### File Handling
- Use Files API for content reused across multiple requests
- Code execution sandbox includes `python-docx`, `matplotlib`, `pillow`, `pypdf`

## Common Pitfalls

- Don't truncate large inputs silently
- Fable 5 / Opus 4.7 / 4.8 reject `budget_tokens`, `temperature`, `top_p`, `top_k`
- Fable 5 requires 30-day data retention; may return `stop_reason: "refusal"`
- Fable 5 tokenizer produces ~30% more tokens than Opus-tier
- Confirm migration scope before editing multiple files
- Use `stream.get_final_message()` / `.finalMessage()` for streaming with high `max_tokens`
- Always parse tool inputs with `json.loads()`, not raw string matching

## When to WebFetch Live Docs

Fetch live documentation when the user asks for "latest," "current," or mentions features not in cached data.
