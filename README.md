<p align="center">
  <img src="./public/assets/midpointx-logo.png" alt="MidpointX Logo" width="800">
</p>

# MidpointX: The Autonomous A2A Reasoning Engine

MidpointX is an advanced, local-first, stateful reasoning engine designed to deliver high-leverage architectural efficiency. Built on an innovative Action-to-Action (A2A) protocol, MidpointX transcends traditional command execution—it autonomously reasons, learns, and evolves its own logic to solve complex software engineering challenges.

By employing a powerful **Cognitive Compaction** strategy within a recursive LangGraph-based architecture, MidpointX avoids the pitfalls of "context rot" and quadratic token growth. The result is a self-healing, highly resilient engineering assistant that operates with laser focus and exceptional cost efficiency.

---

## 🏗️ Architecture & How It Works

MidpointX operates on a decoupled, event-driven architecture using stateful LangGraph nodes known as "Actors." This separation of cognitive labor from mechanical execution ensures optimal performance and scalability.

```mermaid
graph TD
    A[User Request] --> B(ReflectionActor)
    B --> C(AnalysisActor)
    
    subgraph Execution Loop
        C -->|EnvironmentProbe| D{Context Size Limit?}
        D -- Exceeded --> E(CompactionActor)
        D -- Safe --> F(ActionActor)
        E --> F
        F -->|Provision MCP & Shell Tools| G[Execute Action]
        G --> H{Task Complete?}
        H -- No --> B
    end
    
    subgraph Self-Improvement Cycle
        H -- Yes --> I(LearnActor)
        I -->|Propose Shift| J(JustificationProtocol)
        J -->|Safety Check| K(RegressionTester)
        K -->|Simulate| L(ModifyActor)
        L -->|Commit to Memory| M[(Markdown Skills)]
    end
```

### Core LangGraph Actors

1. **ReflectionActor (`reflectNode`)**: Initiates the cognitive loop by reviewing the user's intent, uncovering hidden constraints, and identifying potential failure points.
2. **AnalysisActor (`analyzeNode`)**: Ingests the `EnvironmentProbe` fingerprint and dynamic tools to generate a grounded, step-by-step strategy.
3. **ActionActor (`actionNode`)**: Dynamically provisions relevant Model Context Protocol (MCP) tools and shell commands, invoking the Worker LLM to execute the next logical step.
4. **CompactionActor (`compactionNode`)**: Triggered when state tokens exceed safety thresholds. It summarizes reasoning traces, extracts actionable checklists, and prunes action history to maintain a lean context window.
5. **LearnActor (`learnNode`)**: Evaluates completed tasks to determine if a novel approach was required, proposing a structured "Logic Shift" for future optimization.
6. **JustificationProtocol (`justifyNode`)**: Acts as a strict safeguard ("LLM-as-a-judge"), evaluating proposed logic shifts for safety, security, and structural soundness.
7. **RegressionTester (`regressNode`)**: Simulates the proposed shift against concurrent mock tasks to guarantee system stability.
8. **ModifyActor (`modifyNode`)**: Commits the verified logic shift to persistent memory as an autonomous Markdown skill.

---

## 🚀 System Capabilities

### 🧠 1. Cognitive Architecture
*   **Action-to-Action (A2A) Protocol**: Transcends traditional command execution by enabling recursive reasoning and autonomous strategy pivots.
*   **LangGraph Actor System**: A modular loop involving **Reflection, Analysis, Action, and Learning** nodes for complex multi-step orchestration.
*   **Cognitive Compaction**: Intelligent state management that summarizes reasoning traces and prunes history to maintain optimal performance without "context rot."
*   **Self-Healing Resilience**: All LLM operations are wrapped in a robust recovery layer with exponential backoff and deterministic error surfacing.

### 🖥️ 2. Native Desktop Automation
*   **Precision Humanoid Control**: High-fidelity mouse movement, complex keyboard emulation, and application lifecycle management (Launch/Monitor/Kill).
*   **Visual Historical Memory**: A rolling buffer of visual snapshots allows the agent to verify state changes and reason about historical UI transitions.
*   **UI Element Discovery**: Advanced text-to-coordinate mapping via `VisualProbe` for interacting with legacy or non-accessible applications.
*   **Universal Filesystem Intelligence**: Deep, cross-platform access for secure file manipulation, metadata analysis, and pattern-based searching.

### 🌐 3. Web & Browser Intelligence
*   **Isolated Session Guard**: Spawns cryptographically isolated Puppeteer instances per user, ensuring strict privacy and data separation.
*   **Persistent Digital Identity**: Support for local browser profiles, allowing the agent to maintain secure sessions in Gmail, GitHub, and other enterprise tools.
*   **Full-Spectrum Automation**: Expert-level navigation, form-filling, shadow DOM interaction, and custom JavaScript evaluation.

### 🔌 4. Extensible Ecosystem (MCP)
*   **Dynamic Tool Injection**: Native support for the **Model Context Protocol (MCP)**, enabling instant integration with a vast library of external servers.
*   **MD Skills (Theorems)**: Hot-reloadeable operational patterns defined in Markdown, allowing the agent to "learn" and adapt to new workflows without code changes.
*   **Zero-Configuration Portability**: MidpointX’s `EnvironmentProbe` fingerprints your environment on boot, automatically resolving paths and binaries for instant adaptation.

### 📱 5. Multi-Channel Orchestration
*   **Proactive Messaging**: Orchestrate complex tasks across Web, Telegram, and Discord with real-time status synchronization.
*   **Human-in-the-Loop (HITL)**: Secure remote approval gates delivered directly to mobile devices for sensitivity-aware operations.
*   **Voice Command Support**: Process voice notes (STT) and provide auditory feedback (TTS) for true hands-free operation.

---

## 📖 Complete Setup Guide

### Prerequisites

Ensure your environment meets the following requirements:
* **Node.js** (v18 or higher)
* **npm** or **yarn** package manager
* **API Keys** for your preferred LLM provider (e.g., Google AI Studio, Anthropic, OpenAI, or OpenRouter).

### 1. Clone the Repository

Begin by cloning the MidpointX repository and navigating into the directory:

```bash
git clone https://github.com/your-org/MidpointX.git
cd MidpointX
```

### 2. Install Dependencies

Install the required Node.js packages:

```bash
npm install
```

### 3. Environment Configuration

Copy the provided example environment file to create your local `.env` configuration:

```bash
cp .env.example .env
```

Open the `.env` file and configure your API keys and model preferences:

```env
# Agent Model Selection
ACTIVE_LLM_PROVIDER="google" # Options: 'google', 'anthropic', 'openai', 'openrouter', 'local'
ACTIVE_MODEL_NAME="gemini-2.5-pro" # Your Expert Tier Model
WORKER_MODEL_NAME="gemini-2.5-flash" # Your Worker Tier Model

# API Keys
GEMINI_API_KEY="your_api_key_here"
ANTHROPIC_API_KEY="your_api_key_here"
OPENAI_API_KEY="your_api_key_here"
OPENROUTER_API_KEY="your_api_key_here"

# System Settings (Optional)
PORT=8080
RETRY_COUNT=5
MAX_RECURSION_LIMIT=150
```

### 4. Build the Project

Compile the TypeScript codebase to prepare the system for execution:

```bash
npm run build:full
```

*(Note: If you encounter permission issues with `tsc` on Linux/macOS, you may need to run `chmod +x node_modules/.bin/tsc` first).*

### 5. Start the Engine

To start the production server:

```bash
npm start
```

For local development with hot-reloading (frontend and backend concurrently):

```bash
npm run dev
```

The system will initialize on the port specified in your `.env` (default `8080`), serve the MidpointX UI, and expose the primary A2A negotiation endpoint at `/api/v1/a2a-negotiate`.

---

## 💡 Example Usage

Send a complex task to the agent and watch it reason, execute, and learn.

**Example Task:**

> "Analyze `src/nodes/modifyNode.ts`. Identify if it currently uses the new `invokeWithResilience` wrapper. If it does not, refactor the file to import the resilience layer and wrap the LLM call. After the refactor is complete, ensure the project builds correctly."

MidpointX will autonomously map its environment, read the file, perform the refactor, verify the build, compress its context, and determine if it needs to memorize a new skill—all with zero human intervention.

---

*MidpointX: High-level reasoning, perfected for the local environment.*
