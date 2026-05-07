import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

// Zod Schema for the Proposed Logic Shift (Used later in the LearnNode)
export const LogicShiftSchema = z.object({
  theoremId: z.string().describe("A unique identifier for this new logic rule, e.g., THEOREM_NET_01"),
  pattern: z.string().describe("The trigger pattern for this logic"),
  optimization: z.string().describe("The new optimized approach"),
  justification: z.string().describe("Explain why the standard approach was insufficient and why this theorem is necessary."),
  conceptualTags: z.array(z.string()).max(3).describe("Broad, conceptual semantic tags to ensure future RAG retrieval. (STRICT MAXIMUM OF 3 TAGS)"),
}).describe("A new operational pattern or optimization theorem that the agent should permanently learn.");

export type LogicShift = z.infer<typeof LogicShiftSchema>;

// Phase 2: Strategic Plan Schema
export const StrategicPlanSchema = z.object({
  plan: z.array(z.string()).describe("A list of concrete, actionable steps to complete the task."),
  rationale: z.string().describe("A brief explanation of why this plan was chosen.")
});

export type StrategicPlan = z.infer<typeof StrategicPlanSchema>;

// The LangGraph State Definition
export const MidpointXState = Annotation.Root({
  // Ingress
  taskId: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  userIntent: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  environmentFingerprint: Annotation<any>({ reducer: (x: any, y: any) => y, default: () => null }),
  operatorIdentity: Annotation<any>({ reducer: (x: any, y: any) => y, default: () => null }),
  conciseIntent: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  executionMode: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "api" }),
  
  // Cognitive Layer Outputs
  reflectionTrace: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  analysisResult: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  citedSkills: Annotation<string[]>({ reducer: (x: string[], y: string[]) => [...new Set([...x, ...y])], default: () => [] }),
  pruningTrace: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  proposedShift: Annotation<LogicShift | null>({ reducer: (x: LogicShift | null, y: LogicShift | null) => y, default: () => null }),
  
  // Strategic Planning (Phase 2)
  strategicPlan: Annotation<string[]>({ reducer: (x: string[], y: string[]) => y, default: () => [] }),
  planStatus: Annotation<Record<string, 'pending' | 'active' | 'completed' | 'failed'>>({ reducer: (x: any, y: any) => y, default: () => ({}) }),
  
  // Safeguard Layer
  isJustified: Annotation<boolean>({ reducer: (x: boolean, y: boolean) => y, default: () => false }),
  regressionPassed: Annotation<boolean>({ reducer: (x: boolean, y: boolean) => y, default: () => false }),
  
  // Execution Layer
  actionHistory: Annotation<any[]>({ reducer: (x: any[], y: any[]) => y, default: () => [] }),
  isTaskComplete: Annotation<boolean>({ reducer: (x: boolean, y: boolean) => y, default: () => false }),
  finalOutcome: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  temporalInsight: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),

  // Diagnostics
  totalInputTokens: Annotation<number>({ reducer: (x: number, y: number) => x + y, default: () => 0 }),
  totalOutputTokens: Annotation<number>({ reducer: (x: number, y: number) => x + y, default: () => 0 }),
  internalTurns: Annotation<number>({ reducer: (x: number, y: number) => x + y, default: () => 0 }),
  
  // Desktop OS State
  currentScreenshot: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  visualBuffer: Annotation<string[]>({ reducer: (x: string[], y: string[]) => y, default: () => [] }),
  lastMousePosition: Annotation<{x: number, y: number} | null>({ reducer: (x: any, y: any) => y, default: () => null }),

  // Security & Human Doorbell
  pendingAction: Annotation<{ tool: string, args: any } | null>({ reducer: (x: any, y: any) => y, default: () => null }),
  needsApproval: Annotation<boolean>({ reducer: (x: boolean, y: boolean) => y, default: () => false }),
  approvalStatus: Annotation<'pending' | 'approved' | 'denied' | null>({ reducer: (x: any, y: any) => y, default: () => null }),
  highFidelityContext: Annotation<string[]>({ reducer: (x: string[], y: string[]) => [...x, ...y], default: () => [] }),

  // Artifacts & File Delivery
  outputArtifacts: Annotation<any[]>({ reducer: (x: any[], y: any[]) => [...x, ...y], default: () => [] }),

  // Intent Preservation & Context Compression
  historySummary: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),

  // Re-planning & Security (Death Spiral Prevention)
  replanCount: Annotation<number>({ reducer: (x: number, y: number) => x + y, default: () => 0 }),
  failureThesis: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  abandonedPlans: Annotation<any[]>({ reducer: (x: any[], y: any[]) => [...x, ...y], default: () => [] }),
});
