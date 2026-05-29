import "dotenv/config";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import * as path from "path";
import * as fs from "fs/promises";
import * as crypto from "crypto";
import axios from "axios";

import { MidpointXState } from "../core/state";
import { LLMFactory } from "../core/llmFactory";
import { PluginRegistry } from "../core/pluginRegistry";
import { invokeWithResilience } from "../core/resilience";
import { A2AProtocol } from "../core/protocol";

const SKILLS_DIR = path.resolve(__dirname, "../../src/plugins/skills");
const MAX_SEARCH_CHARS = 6000; // Truncate web results to keep prompt tight

/**
 * Derive a stable, filesystem-safe ID from a query string.
 */
function queryToId(query: string): string {
  const hash = crypto.createHash("sha1").update(query).digest("hex").slice(0, 6).toUpperCase();
  const slug = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("_")
    .toUpperCase();
  return `SYNTH_${slug}_${hash}`;
}

/**
 * Fetch web content for a search query via axios (DuckDuckGo HTML endpoint).
 * Falls back gracefully if the request fails.
 */
async function webSearch(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);
  try {
    const response = await axios.get<string>(
      `https://html.duckduckgo.com/html/?q=${encoded}`,
      { timeout: 15000, responseType: "text", headers: { "User-Agent": "MidpointX/2.0" } }
    );
    const stripped = String(response.data)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim();
    return stripped.slice(0, MAX_SEARCH_CHARS);
  } catch (err: any) {
    console.warn("⚠️ [SkillAcquisitionActor] Web search failed:", err.message);
    return "";
  }
}

/**
 * Use a targeted fetch to grab a documentation page (e.g. npm page, MDN, GitHub README).
 * Used as a supplemental source when the LLM proposes a specific URL.
 * URL is validated before use to prevent injection via non-HTTP schemes.
 */
async function fetchDocPage(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn("⚠️ [SkillAcquisitionActor] Invalid URL rejected:", url);
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    console.warn("⚠️ [SkillAcquisitionActor] Non-HTTP URL rejected:", url);
    return "";
  }

  try {
    const response = await axios.get<string>(parsed.href, {
      timeout: 12000,
      responseType: "text",
      headers: { "User-Agent": "MidpointX/2.0 (+research)" },
      maxRedirects: 3
    });
    const stripped = String(response.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim();
    return stripped.slice(0, MAX_SEARCH_CHARS);
  } catch {
    return "";
  }
}

/**
 * NODE: SkillAcquisitionActor
 *
 * Triggered when `state.skillGapQuery` is non-empty.
 * Searches the web, synthesizes a reusable .md skill file, hot-reloads it
 * into the PluginRegistry, and returns to AnalysisActor with the new skill
 * available to the supervisor.
 */
export async function skillAcquisitionNode(state: typeof MidpointXState.State) {
  const query = state.skillGapQuery;
  if (!query) {
    console.warn("⚠️ [SkillAcquisitionActor] Invoked with empty skillGapQuery. Skipping.");
    return A2AProtocol.commit("SkillAcquisitionActor", { skillGapQuery: "" });
  }

  const skillId = queryToId(query);
  console.log(`🔍 [SkillAcquisitionActor] Researching skill gap: "${query}" → ID: ${skillId}`);

  // ── 1. Web Research ──────────────────────────────────────────────────────
  const searchResults = await webSearch(query);
  let researchCorpus = searchResults;

  if (!researchCorpus) {
    console.warn("⚠️ [SkillAcquisitionActor] No web results. Synthesizing from LLM knowledge alone.");
  }

  // ── 2. Skill Synthesis via LLM ───────────────────────────────────────────
  const model = LLMFactory.getModel({ temperature: 0.2 });

  const synthesisPrompt = `You are MidpointX's Skill Synthesizer. Your job is to create a reusable agent skill document in Markdown format.

SKILL GAP QUERY: "${query}"

CONTEXT — The agent encountered this gap while completing a task. The agent runs on Windows with PowerShell available. 
It has access to: filesystem MCP (read/write files), fetch MCP (HTTP requests), Google Workspace MCP, execute_system_command (PowerShell).

WEB RESEARCH RESULTS:
${researchCorpus || "(No web results available — use your training knowledge)"}

---

Generate a Markdown skill file with EXACTLY this structure:

\`\`\`markdown
---
name: ${skillId}
description: <One-line summary of what this skill enables the agent to do>
---

# Skill: ${skillId}

## When to Use
<2-3 bullet points describing the exact situation that triggers this skill>

## Prerequisites
<Any tools, environment variables, or setup needed>

## Procedure
<Step-by-step instructions written for an AI agent, not a human.
Include exact PowerShell commands, tool names, and argument patterns.
Be concrete — the agent will follow these instructions literally.>

## Example Tool Calls
<Show 1-2 concrete example tool call invocations the agent should use>

## Common Pitfalls
<1-3 known failure modes and how to avoid them>
\`\`\`

Output ONLY the raw markdown content. No code fences, no preamble.`;

  const payload = [
    new SystemMessage("You are a precise technical writer for an autonomous AI agent system. Output only valid Markdown."),
    new HumanMessage(synthesisPrompt)
  ];

  let skillContent = "";
  try {
    const response = await invokeWithResilience(model, payload);
    const content = response.content;
    skillContent = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join("\n")
        : String(content);

    // Strip accidental code fences if the model wrapped the output
    skillContent = skillContent
      .replace(/^```(?:markdown)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
  } catch (err: any) {
    console.error("❌ [SkillAcquisitionActor] LLM synthesis failed:", err.message);
    return A2AProtocol.commit("SkillAcquisitionActor", {
      skillGapQuery: "",
      failureThesis: `Skill synthesis failed for query "${query}": ${err.message}`
    });
  }

  // ── 3. Write Skill File ──────────────────────────────────────────────────
  await fs.mkdir(SKILLS_DIR, { recursive: true });
  const filePath = path.join(SKILLS_DIR, `${skillId}.md`);

  try {
    await fs.writeFile(filePath, skillContent, "utf-8");
    console.log(`✅ [SkillAcquisitionActor] Wrote skill file: ${filePath}`);
  } catch (err: any) {
    console.error("❌ [SkillAcquisitionActor] Failed to write skill file:", err.message);
    return A2AProtocol.commit("SkillAcquisitionActor", {
      skillGapQuery: "",
      failureThesis: `Could not write skill file for "${query}": ${err.message}`
    });
  }

  // ── 4. Hot-reload into PluginRegistry ────────────────────────────────────
  const loadedName = await PluginRegistry.hotReloadSkill(filePath);

  console.log(`🧠 [SkillAcquisitionActor] Skill "${loadedName || skillId}" is now live. Resuming task...`);

  // ── 5. Return — clears skillGapQuery, records skill ID ──────────────────
  return A2AProtocol.commit("SkillAcquisitionActor", {
    skillGapQuery: "",               // Consumed — prevents re-triggering
    synthesizedSkillId: loadedName || skillId,
    // Inject a note into workerOutput so the supervisor sees the acquisition result
    workerOutput: `[SKILL ACQUIRED] New skill "${loadedName || skillId}" has been synthesized and loaded. `
      + `It covers: ${query}. Use it to continue the task.`
  });
}
