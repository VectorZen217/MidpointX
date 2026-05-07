import "dotenv/config";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { invokeWithResilience } from "../core/resilience";
import { LLMFactory } from "../core/llmFactory";
import { PluginRegistry } from "../core/pluginRegistry";
import { MIDPOINTX_SYSTEM_PROMPT } from "../core/prompt";
import { FunctionDeclaration } from "@google/genai";

// @ts-ignore TS2589: LangChain tool() hits TS5.8+ instantiation depth limit — runtime behavior is correct
const executeSystemCommand = (tool(
  async (input: { command: string; workingDirectory?: string }) => { 
    return "This is a proxy."; 
  },
  {
    name: "execute_system_command",
    description: "Executes an authorized system command or API call on behalf of the user.",
    schema: z.object({
      command: z.string().describe("The raw command to execute"),
      workingDirectory: z.string().optional().describe("Optional dir")
    })
  }
)) as any;

async function test() {
  await PluginRegistry.init();
  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  
  const mcpTools = PluginRegistry.getActiveTools().map((t: FunctionDeclaration) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
  }));
  console.log("MCP Tools loaded:", mcpTools.length);

  const modelWithTools = (model as unknown as BaseChatModel).bindTools!([
    executeSystemCommand,
    ...mcpTools
  ]);

  const payload = [
    new SystemMessage(MIDPOINTX_SYSTEM_PROMPT + `\n\nCRITICAL EXECUTION DIRECTIVES:
1. You are the Execution Agent. You have access to 'execute_system_command' AND dynamic tools (MCP servers, skills).
2. Prioritize using domain-specific MCP tools (e.g. browser__*, filesystem__*) over raw shell commands whenever possible.
3. Fall back to 'execute_system_command' ONLY for tasks that lack a specific tool (e.g. starting processes, installing dependencies).
4. You MUST complete EVERY sub-task in the strategy before declaring task complete. Review the Previous Action History to determine which steps remain.
5. If an action fails (e.g., EPERM, ElementHandle null), modify your approach. Do NOT repeat the exact same failing command.
6. Only return a plain text summary (no tool call) when ALL steps are fully completed.`),
    new HumanMessage(`
      User Intent: Use the system shell to find the top 3 coffee shops in Fargo listed on a site like TripAdvisor or Yelp (via DuckDuckGo HTML)
      Validated Strategy: 1. Search for Coffee Shops: Execute a web search for the top coffee shops in Fargo on a review site and save the HTML output.
      
      Previous Action History (steps already completed):
      []
      
      Review the history above. If any steps from the strategy are NOT yet in the history, execute the next logical step using the most appropriate tool.
    `)
  ];

  const response = await invokeWithResilience(modelWithTools, payload);
  console.log("TOOL CALLS:", JSON.stringify(response.tool_calls, null, 2));
  console.log("CONTENT:", response.content);
}

test().catch(console.error);
