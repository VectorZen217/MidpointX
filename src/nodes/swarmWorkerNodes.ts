import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { MidpointXState } from "../core/state";
import { LLMFactory } from "../core/llmFactory";
import { invokeWithResilience } from "../core/resilience";
import { A2AProtocol } from "../core/protocol";
import { WorkspaceLoader } from "../core/workspaceLoader";
import { SwarmBus } from "../core/swarmBus";

/**
 * Safely extracts plain text from LangChain response content.
 */
function extractText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text ?? "")
      .join("");
  }
  return String(content);
}

/**
 * WORKER 1: ResearcherAgent
 * Highly specialized in scraping, searching, discovering files/APIs, and gathering info.
 */
export async function researchWorkerNode(state: typeof MidpointXState.State) {
  const agentId = `researcher-${Date.now()}`;
  console.log(`🔍 [ResearcherAgent] Executing sub-goal: "${state.workerSubGoal}"`);

  SwarmBus.emit("swarm:agent_spawned", {
    agentId,
    role: "researcher",
    task: state.workerSubGoal || "Research task",
    parentId: state.taskId
  });

  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();

  const payload = [
    new SystemMessage(`You are the specialized MidpointX ResearcherAgent.\n${agentPersona}\n
Your mandate is to gather information, search files, read documentation, and discover APIs.
Output your research findings in a clean, highly structured Markdown report. Limit yourself strictly to investigation and research. Do not attempt to modify code or run tests.`),
    new HumanMessage(`Sub-Goal to Investigate: ${state.workerSubGoal}\n\nCurrent Action History Context:\n${JSON.stringify(state.actionHistory.slice(-5))}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM",
    message: "Analyzing task and gathering information...",
    tokensUsed: 0
  });

  const response = await invokeWithResilience(model, payload);
  const textOutput = extractText(response.content);
  const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

  SwarmBus.emit("swarm:agent_complete", {
    agentId,
    result: textOutput.substring(0, 200),
    duration: 0,
    tokensUsed
  });

  console.log(`✅ [ResearcherAgent] Investigation complete.`);

  return A2AProtocol.commit("ResearcherAgent", {
    workerOutput: textOutput,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0
  }, state);
}

/**
 * WORKER 2: DeveloperAgent
 * Specialized in surgical code refactoring, writing files, and developing components.
 */
export async function developerWorkerNode(state: typeof MidpointXState.State) {
  const agentId = `developer-${Date.now()}`;
  console.log(`💻 [DeveloperAgent] Executing sub-goal: "${state.workerSubGoal}"`);

  SwarmBus.emit("swarm:agent_spawned", {
    agentId,
    role: "developer",
    task: state.workerSubGoal || "Development task",
    parentId: state.taskId
  });

  const model = LLMFactory.getModel({ temperature: 0.2, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();

  const payload = [
    new SystemMessage(`You are the specialized MidpointX DeveloperAgent.\n${agentPersona}\n
Your mandate is to write clean, maintainable TypeScript/JavaScript code, perform surgical edits, refactor components, and design implementation patterns.
Analyze the researcher's findings and user goals, and draft precise code updates or structural refactoring blocks. Focus exclusively on development tasks.`),
    new HumanMessage(`Sub-Goal to Implement: ${state.workerSubGoal}\n\nResearcher Input/Context:\n${state.workerOutput}\n\nCurrent Action History Context:\n${JSON.stringify(state.actionHistory.slice(-5))}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM",
    message: "Synthesizing implementation from research output...",
    tokensUsed: 0
  });

  if (state.workerOutput) {
    SwarmBus.emit("swarm:agent_message", {
      fromId: "researcher",
      toId: agentId,
      content: state.workerOutput.substring(0, 120),
      type: "handoff"
    });
  }

  const response = await invokeWithResilience(model, payload);
  const textOutput = extractText(response.content);
  const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

  SwarmBus.emit("swarm:agent_complete", {
    agentId,
    result: textOutput.substring(0, 200),
    duration: 0,
    tokensUsed
  });

  console.log(`✅ [DeveloperAgent] Synthesis complete.`);

  return A2AProtocol.commit("DeveloperAgent", {
    workerOutput: textOutput,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0
  }, state);
}

/**
 * WORKER 3: TesterAgent
 * Specialized in verification, running tests, checking compilation/linters, and ensuring stability.
 */
export async function testerWorkerNode(state: typeof MidpointXState.State) {
  const agentId = `tester-${Date.now()}`;
  console.log(`🧪 [TesterAgent] Executing sub-goal: "${state.workerSubGoal}"`);

  SwarmBus.emit("swarm:agent_spawned", {
    agentId,
    role: "tester",
    task: state.workerSubGoal || "Verification task",
    parentId: state.taskId
  });

  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();

  const payload = [
    new SystemMessage(`You are the specialized MidpointX TesterAgent.\n${agentPersona}\n
Your mandate is to run test suites, check linter output, execute tsc type checking, audit security boundaries, and evaluate system stability.
Identify edge cases, failure scenarios, and verify builds based on developer outputs.`),
    new HumanMessage(`Sub-Goal to Verify: ${state.workerSubGoal}\n\nDeveloper Output to Verify:\n${state.workerOutput}\n\nCompiler Trace Context:\n${state.compilerTrace || "No trace active"}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM",
    message: "Verifying developer output for correctness...",
    tokensUsed: 0
  });

  if (state.workerOutput) {
    SwarmBus.emit("swarm:agent_message", {
      fromId: "developer",
      toId: agentId,
      content: state.workerOutput.substring(0, 120),
      type: "handoff"
    });
  }

  const response = await invokeWithResilience(model, payload);
  const textOutput = extractText(response.content);
  const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

  SwarmBus.emit("swarm:agent_complete", {
    agentId,
    result: textOutput.substring(0, 200),
    duration: 0,
    tokensUsed
  });

  console.log(`✅ [TesterAgent] Verification planning complete.`);

  return A2AProtocol.commit("TesterAgent", {
    workerOutput: textOutput,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0
  }, state);
}
