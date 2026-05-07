import { ScreenCapture } from "./ScreenCapture";
import { LLMFactory } from "../../core/llmFactory";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

/**
 * VisualProbe — provides visual reasoning capabilities for the desktop environment.
 * Uses Gemini Vision or other vision-capable models to "see" the screen.
 */
export class VisualProbe {
  /**
   * Describes the current screen state in natural language.
   */
  static async scanScreen(): Promise<string> {
    try {
      const base64 = await ScreenCapture.captureBase64();
      const model = LLMFactory.getModel({ temperature: 0.2, tier: "worker" });

      const payload = [
        new SystemMessage("You are a visual UI analyzer. Describe the current desktop state, active windows, and any prominent UI elements you see."),
        new HumanMessage({
          content: [
            { type: "text", text: "What is currently on the screen?" },
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }
          ]
        })
      ];

      const response = await model.invoke(payload);
      return String(response.content);
    } catch (err: any) {
      return `Visual scan failed: ${err.message}`;
    }
  }

  /**
   * Finds the (x, y) coordinates for a specific text string or UI element on the screen.
   * Returns coordinates or an error message.
   */
  static async findElement(query: string): Promise<{x: number, y: number} | string> {
    try {
      const base64 = await ScreenCapture.captureBase64();
      const model = LLMFactory.getModel({ temperature: 0.1 });

      const payload = [
        new SystemMessage(`You are a UI coordinate locator. Given a screenshot and a query, return ONLY the center (x, y) coordinates for the element. 
        Return format: {"x": integer, "y": integer}. 
        If not found, return {"error": "reason"}.`),
        new HumanMessage({
          content: [
            { type: "text", text: `Find the coordinates for: ${query}` },
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }
          ]
        })
      ];

      const response = await model.invoke(payload);
      const text = String(response.content).trim();
      
      try {
        const parsed = JSON.parse(text.match(/\{.*\}/)![0]);
        if (parsed.error) return parsed.error;
        return { x: parsed.x, y: parsed.y };
      } catch {
        return `Failed to parse coordinates from response: ${text}`;
      }
    } catch (err: any) {
      return `Visual search failed: ${err.message}`;
    }
  }
}
