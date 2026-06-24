import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { MidpointXState } from "../core/state";
import { LLMFactory } from "../core/llmFactory";
import { invokeWithResilience } from "../core/resilience";
import { A2AProtocol } from "../core/protocol";
import { WorkspaceLoader } from "../core/workspaceLoader";
import { SwarmBus } from "../core/swarmBus";
import { extractText } from "./cognitiveNodes";

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

  const { PluginRegistry } = await import("../core/pluginRegistry");
  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();
  const baseModel = model as any;

  // Bind tools for research (fetch, file operations, searches)
  const researchTools = PluginRegistry.getActiveTools()
    .filter(t => t.name && (
      t.name.includes("fetch") ||
      t.name.includes("filesystem__read") ||
      t.name.includes("search") ||
      t.name.includes("file")
    ))
    .slice(0, 30);

  const modelWithTools = baseModel.bindTools ? baseModel.bindTools(researchTools) : baseModel;

  const payload = [
    new SystemMessage(`You are the specialized MidpointX ResearcherAgent.\n${agentPersona}\n
Your mandate is to gather information, search files, read documentation, and discover APIs using the tools at your disposal.
Output your research findings in a clean, highly structured Markdown report. Limit yourself strictly to investigation and research. Do not attempt to modify code or run tests.
CRITICAL: Use fetch, search, and file tools to gather REAL data. Do not generate placeholder information.`),
    new HumanMessage(`Sub-Goal to Investigate: ${state.workerSubGoal}\n\nCurrent Action History Context:\n${JSON.stringify(state.actionHistory.slice(-5))}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM with tools",
    message: "Executing research with tools enabled...",
    tokensUsed: 0
  });

  const response = await invokeWithResilience(modelWithTools, payload) as any;
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

  const { PluginRegistry } = await import("../core/pluginRegistry");
  const model = LLMFactory.getModel({ temperature: 0.2, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();
  const baseModel = model as any;

  // Bind tools for development (file writes, code execution, compilation)
  const devTools = PluginRegistry.getActiveTools()
    .filter(t => t.name && (
      t.name.includes("filesystem__write") ||
      t.name.includes("execute_system_command") ||
      t.name.includes("compile") ||
      t.name.includes("test")
    ))
    .slice(0, 30);

  const modelWithTools = baseModel.bindTools ? baseModel.bindTools(devTools) : baseModel;

  const payload = [
    new SystemMessage(`You are the specialized MidpointX DeveloperAgent.\n${agentPersona}\n
Your mandate is to write clean, maintainable TypeScript/JavaScript code, perform surgical edits, refactor components, and design implementation patterns.
You have access to file writing and execution tools. Use them to implement solutions based on the researcher's findings.
CRITICAL: Do not just draft code — actually WRITE files and execute compilation to verify your work.`),
    new HumanMessage(`Sub-Goal to Implement: ${state.workerSubGoal}\n\nResearcher Input/Context:\n${state.workerOutput}\n\nCurrent Action History Context:\n${JSON.stringify(state.actionHistory.slice(-5))}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM with tools",
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

  const response = await invokeWithResilience(modelWithTools, payload) as any;
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

  const { PluginRegistry } = await import("../core/pluginRegistry");
  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();
  const baseModel = model as any;

  // Bind tools for testing (execute commands, read files, run tests)
  const testTools = PluginRegistry.getActiveTools()
    .filter(t => t.name && (
      t.name === "execute_system_command" ||
      t.name.includes("filesystem__read") ||
      t.name.includes("test") ||
      t.name.includes("compile")
    ))
    .slice(0, 30);

  const modelWithTools = baseModel.bindTools ? baseModel.bindTools(testTools) : baseModel;

  const payload = [
    new SystemMessage(`You are the specialized MidpointX TesterAgent.\n${agentPersona}\n
Your mandate is to run test suites, check linter output, execute tsc type checking, audit security boundaries, and evaluate system stability.
You have access to execution tools. Use them to verify the developer's work by running tests, type checks, and lint analysis.
CRITICAL: Actually RUN tests and verification commands. Do not just review code.`),
    new HumanMessage(`Sub-Goal to Verify: ${state.workerSubGoal}\n\nDeveloper Output to Verify:\n${state.workerOutput}\n\nCompiler Trace Context:\n${state.compilerTrace || "No trace active"}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM with tools",
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

  const response = await invokeWithResilience(modelWithTools, payload) as any;
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
