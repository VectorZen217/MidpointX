import { MidpointXState } from "../core/state";
import { ScreenCapture } from "../plugins/desktop/ScreenCapture";

export const computerUseNode = async (state: typeof MidpointXState.State) => {
  console.log("💻 [ComputerUseNode] Synthesizing Desktop State...");

  // Capture current screen
  const screenshotBase64 = await ScreenCapture.captureBase64();

  // If node was called, state might dictate a visual intent, so we attach the screenshot.
  // The actual execution happens via tools in actionNode, but we ensure the visual payload is fresh
  // in the state so Expert Mode LLM can perceive it in Analysis.

  return {
    currentScreenshot: screenshotBase64
  };
};
