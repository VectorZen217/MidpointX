# System Capabilities Documentation

This document outlines the core capabilities of the system, focusing on LLM integration, resilience, and data validation.

## Supported LLM Providers

The system is designed to integrate with various Large Language Model (LLM) providers, offering flexibility and choice. Currently supported providers typically include:

*   **OpenAI**: Access to models like GPT-3.5, GPT-4.
*   **Google Generative AI**: Integration with models such as Gemini.
*   **Anthropic**: Support for Claude models.

The llmFactory.ts module abstracts the provider-specific implementations, allowing for easy extension and switching between different LLM services.

## p-retry Resilience Logic

The system incorporates p-retry for robust error handling and resilience when interacting with external services, particularly LLM APIs. This library automatically retries failed asynchronous operations, enhancing the system's stability against transient network issues or API rate limits.

Key aspects of the p-retry implementation:

*   **Automatic Retries**: Operations are automatically retried a configurable number of times upon failure.
*   **Exponential Backoff**: Retries typically employ an exponential backoff strategy, increasing the delay between attempts to prevent overwhelming the external service.
*   **Customizable Conditions**: Retry logic can be configured to only retry on specific error types (e.g., network errors, rate limit errors) and to stop retrying after a certain number of attempts or a total timeout.
*   **onRetry Hook**: A callback function (onRetry) can be used to log retry attempts or perform other side effects, providing visibility into the retry process.

Example configuration often includes maxAttempts, minTimeout, and actor for exponential backoff.

## Zod Schema Property Tags

Zod is used extensively throughout the system for schema declaration and validation, ensuring data integrity and type safety. It allows for defining robust schemas for input and output data, catching errors early in the development cycle and at runtime.

Common Zod schema property tags and their uses:

*   .string(): Defines a property as a string.
*   .number(): Defines a property as a number.
*   .boolean(): Defines a property as a boolean.
*   .array(z.string()): Defines a property as an array of strings (or any other Zod type).
*   .object({ key: z.string() }): Defines a nested object with its own schema.
*   .optional(): Marks a property as optional.
*   .nullable(): Marks a property as nullable (can be 
ull).
*   .default('value'): Provides a default value if the property is missing.
*   .enum(['A', 'B']): Restricts a string property to a predefined set of values.
*   .refine(val => condition, { message: '...' }): Adds custom validation logic.
*   .transform(val => transformedVal): Transforms the value after validation.

Zod schemas are crucial for validating API payloads, configuration objects, and internal data structures, ensuring that data conforms to expected types and constraints.

---

## Application Control & Visual Memory

The system empowers the agent to act as a **Humanoid Operator** with full control over the host environment, utilizing a sophisticated hybrid execution model.

### **1. Hybrid Execution Model (Stealth vs. Visual)**
The agent intelligently orchestrates its visibility based on the task complexity and reliability:
*   **API Mode (Headless)**: Prioritizes speed and stability by running browser operations in the background. Ideal for high-speed data fetching and background automation.
*   **Visual Mode (Visible)**: Automatically reveals the browser and uses its **Hands** (`desktop__mouse_click`, `desktop__keyboard_type`) to interact with the UI. Required for complex UI navigation, login bypass, and manual recovery.

### **2. Self-Healing Loop Detection**
The system autonomously detects execution stalls. If a sequence of tool calls fails to progress the state (e.g., repeating a failing selector), the system triggers a **Recalculation Event**. This forces a strategy pivot, often switching from API to Visual mode to bypass the technical blocker via manual interaction.

### **3. Universal App Control**
The agent can launch, monitor, and interact with any application on the machine using the `execute_system_command` (e.g., `start chrome`, `code .`, `start excel`). It can then use its **Hands** to operate these apps exactly like a human.

### **4. Visual Memory & Temporal Probing**
The agent maintains a rolling buffer of its visual history in `temp/visual_history`. This is augmented by:
*   **Motion Probes**: Uses FFMPEG burst captures to verify that a click or keystroke actually triggered a visual change on the screen.
*   **Grounded Reasoning**: Cross-references textual tool outputs with visual snapshots to ensure "Truth in Action."

---

## src Directory TypeScript File Structure
D:\MidpointX\src\core\cacheManager.ts
D:\MidpointX\src\core\environmentProbe.ts
D:\MidpointX\src\core\graph.ts
D:\MidpointX\src\core\llmFactory.ts
D:\MidpointX\src\core\memory.ts
D:\MidpointX\src\core\pluginRegistry.ts
D:\MidpointX\src\core\prompt.ts
D:\MidpointX\src\core\state.ts
D:\MidpointX\src\nodes\cognitiveNodes.ts
D:\MidpointX\src\nodes\executionNodes.ts
D:\MidpointX\src\nodes\modifyNode.ts
D:\MidpointX\src\nodes\safeguardNodes.ts
D:\MidpointX\src\server.ts
