# 🚀 MidpointX: System Capabilities

MidpointX is a high-fidelity, **Sovereign Cloud Gateway** designed for professional-grade automation across desktop, web, and multi-channel environments. It leverages a cloud-native, stateful, and decoupled architecture to deliver autonomous reasoning with non-repudiable grounded truth.

---

## 🧠 1. Cognitive Architecture (A2A)
*   **Action-to-Action (A2A) Protocol**: Transcends traditional command execution by enabling recursive reasoning, strategy pivoting, and autonomous collaboration between agents.
*   **Cryptographic A2A Gateway (`POST /api/v1/a2a/delegate`)**: Enables secure, programmatic task delegation between independent agents. Uses Ed25519 payload signature checks and returns signed Host Audit Trail ledgers to prove execution fidelity and alignment.
*   **Path-Scoped Safety Envelopes**: Enforces absolute security constraints during delegation. Incoming tasks are mathematically locked to approved directory paths (e.g. `D:\playground\PolyTrader` sandbox) and authorized tool sub-sets.
*   **Hybrid Execution Architecture**: Dynamic switching between **API Mode** (stealth background automation) and **Visual Mode** (visible desktop interaction). The agent prioritizes speed via APIs but seamlessly pivots to "Hands & Eyes" when background tools hit friction.
*   **Self-Healing Recalculation**: Integrated loop detection that monitors for repeated tool failures. If a strategy stalls, the agent automatically triggers a **Critical Strategy Correction**, recalculating its approach and switching interaction modes to bypass blockers.
*   **LangGraph Actor System**: A modular loop involving **Reflection, Analysis, Action, and Learning** nodes for complex multi-step orchestration.
*   **Cognitive Compaction**: Intelligent state management that summarizes reasoning traces and prunes history to maintain optimal performance without "context rot" during long-running tasks.

## ☁️ 2. Cloud-Native Infrastructure
*   **GCP Optimized Backbone**: Designed for native execution on Google Cloud Platform, utilizing Cloud Run for scalable compute and Cloud Logging for audit trails.
*   **Sovereign Persistence**: State and memory are persisted via **Google Firestore**, providing decoupled, durable, and cryptographically sound session management.
*   **Secret Lifecycle Management**: Integrated with **GCP Secret Manager** for secure, automated credential rotation and zero-trust access control.
*   **Marketplace Readiness**: Fully defined infrastructure-as-code (Terraform) for rapid enterprise deployment.

## 🖥️ 3. Native Desktop & Visual Intelligence
*   **Precision Humanoid Control**: High-fidelity mouse movement, complex keyboard emulation, and application lifecycle management on the host environment.
*   **Stealth vs. Visible Browsing**: Orchestrates browser visibility based on mission profile—remaining hidden for pure data tasks and revealing itself only when manual UI manipulation is required.
*   **Visual Historical Memory**: A rolling buffer of visual snapshots (Temporal Probes) allowing the agent to verify state changes and reason about UI transitions.
*   **Temporal Observation**: FFMPEG-powered burst capture for high-speed verification of dynamic UI elements (loading bars, transitions).
*   **Universal Filesystem Intelligence**: Secure, cross-platform access for metadata analysis, pattern-based searching, and large-scale refactoring.

## 🌐 4. Web & Browser Intelligence
*   **Isolated Session Guard**: Spawns cryptographically isolated browser instances per session, ensuring strict data separation and enterprise-grade privacy.
*   **Stateful Session Serialization & Rehydration**: Deeply serializes active browser sessions—capturing cookies, active tab URLs, HTML DOM structures, and `localStorage`/`sessionStorage` tokens. Rehydrates tabs seamlessly into visible `{ headless: false }` chrome windows.
*   **Persistent Digital Identity**: Support for stable browser profiles, allowing the agent to maintain secure sessions in enterprise tools (Gmail, GitHub, Salesforce).
*   **Intelligent Parameter Normalization**: Automated mapping of disparate tool schemas (e.g., `text` vs `value` or `script` vs `expression`), ensuring high-reliability execution across various MCP browser implementations.
*   **Full-Spectrum Automation**: Expert-level navigation, form-filling, shadow DOM interaction, and custom JavaScript evaluation.

## 🔌 5. Extensible Ecosystem (MCP)
*   **Protocol Aggregation**: Seamlessly connects to Model Context Protocol (MCP) servers, unifying disparate tools (GitHub, Slack, Google Calendar) into a single reasoning interface.
*   **Dynamic Skill Synthesis**: The agent can autonomously discover new API capabilities, generate structured Markdown skills, and hot-load them into its runtime.
*   **Lead-Shielded Execution**: A strict policy engine that prevents destructive tool calls without explicit human approval.
*   **MD Skills (Theorems)**: Hot-reloadeable operational patterns defined in Markdown, allowing the agent to "learn" and adapt to new workflows without code changes.

## 🛰️ 6. Sentinel Proactive Agency
*   **State-Aware Observer Pattern**: Monitors local filesystem changes (`watchPath`), external webhooks (`webhookPath`), and **Workspace Polling** (Gmail/Drive) in real-time.
*   **Silent Assessment Actor**: Every trigger undergoes a background "Silent Assessment" using frugal worker models (`flash-lite`) to filter noise before involving the primary reasoning engine.
*   **Predictive Habit Learning**: A local background observer that monitors application usage rhythms to identify repetitive workflows and propose "Logic Shift" automation theorems.
*   **Unsupervised Sleep-Cycle Habit Mining**: A background maintenance worker that clusters logged user app histories. It isolates high-repetition flows (frequency $\ge 5$), automatically synthesizes custom markdown automation skills in `src/plugins/skills/`, and alerts the operator via Telegram.
*   **85% Confidence Gate**: Mitigates notification fatigue by automatically routing low-confidence events to a Dead-Letter Queue (DLQ).
*   **Workspace Sentinel**: Regularly scans Google Workspace for unread messages and shared files, performing "Cognitive Labor" (drafting, summarizing) before the user even asks.

## 7. Multi-Channel Orchestration
*   **Mobile-First Human Doorbell**: Prioritizes Telegram and Discord as the primary "Approval Gate" for all proactive interventions, allowing for device-agnostic command and control.
*   **Draft-First Protocol**: Proactive email and messaging actions are strictly held in a "Draft" state until explicitly approved via a mobile or web doorbell notification.
*   **Human-in-the-Loop (HITL)**: Secure remote approval gates delivered directly to mobile devices for sensitive or destructive operations.
*   **Multi-Modal Grounding**: Processing of voice notes (STT) and high-resolution images for unified contextual reasoning.

---

*MidpointX: Sovereign Automation • Grounded Truth • Cloud Native*
