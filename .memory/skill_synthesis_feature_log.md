# Reflect & Learn — Mid-Task Skill Synthesis Feature

## Signal: self-improvement

## Task
Implemented the `SkillAcquisitionActor` — a new graph node giving MidpointX the ability to detect a skill gap mid-task, research the web, synthesize a reusable `.md` skill file, hot-reload it into the PluginRegistry, and resume the original task — all autonomously.

## Files Changed
- `src/core/state.ts` — `skillGapQuery`, `synthesizedSkillId` fields
- `src/core/pluginRegistry.ts` — `hotReloadSkill(filePath)` method
- `src/nodes/skillAcquisitionNode.ts` — NEW (research + LLM synthesis + write + hot-reload)
- `src/nodes/cognitiveNodes.ts` — `SwarmRoutingSchema.skillGapQuery`, emit in supervisorNode commit
- `src/core/graph.ts` — `SkillAcquisitionActor` node + routing + return edge

## Key Design Decisions
1. **Reactive trigger only**: `skillGapQuery` is only honoured when `state.failureThesis` is set — avoids unnecessary web calls on the happy path.
2. **SYNTH_ prefix**: Synthesized skills use `SYNTH_<SLUG>_<HASH>.md` naming to differentiate from hand-crafted theorems.
3. **Hot-reload without MCP restart**: `PluginRegistry.hotReloadSkill()` registers a single file into the live `mdSkills` Map — no server bounce needed.
4. **Supervisor sees new skill immediately**: After acquisition routes back to `AnalysisActor`, the supervisor re-runs with the new skill in `skillsStr` context.

## Patterns Learned
- **Skill gap loop pattern**: When an agent repeatedly fails on a domain-specific step with no matching skill, web research + LLM synthesis + hot-reload is more effective than replanning.
- **State as signal bus**: Using `skillGapQuery` as a transient state field (set → consumed → cleared) is a clean way to signal cross-node behavior without coupling nodes directly.

## Result
✅ TypeScript compilation clean. Feature is live and ready for next agent run.
