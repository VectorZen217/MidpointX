# MidpointX Initialization: Reflect & Learn

## Task Outcome
- Phase 1, 2, and 3 successfully implemented and verified.
- Core capability: Self-evolving autonomous agent with a premium UI.

## Non-Obvious Patterns & Gotchas
1. **Duplicate Tool Declarations (Gemini API)**: The Gemini API throws a hard 400 error if it receives duplicate function names, even if the signatures are identical. 
    - *Fix*: Implemented a check in `PluginRegistry.ts` to skip manual tool registration if an MCP server already provided a tool with that name.
2. **Indentation Sensitivity**: `replace_file_content` is extremely sensitive to whitespace. 
    - *Lesson*: Always `view_file` immediately before an edit to ensure the `TargetContent` is an exact match for the current file state.
3. **Graph Flow Optimization**: Placing the `LearnActor` before the `ActionActor` leads to hallucinated learning. 
    - *Evolution*: Moved `LearnActor` to the post-execution phase. The agent now learns from actual mission outcomes, ensuring theorems are grounded in verified success.

## Proposed Permanent Fixes
- Update the `Cognitive Graph` template in future projects to place the `Learning/Reflection` phase at the end of the execution cycle by default.
- Enhance the `PluginRegistry` to automatically namespace all manual tools to avoid collisions with MCP servers.
