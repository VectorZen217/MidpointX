# MidpointX: System Capabilities Outline

MidpointX is a multi-modal, agentic AI framework designed for advanced desktop, web, and system automation. Built on a resilient LangGraph architecture, it combines high-level reasoning with native OS integration.

## 1. Core Cognitive Architecture
*   **Four-Phase Reasoning Loop**:
    *   **Reflection**: Intent decomposition and state analysis.
    *   **Analysis**: Multi-step strategic planning and tool selection.
    *   **Action**: Verifiable execution with real-time environment feedback.
    *   **Learning**: Post-task optimization and "Logic Shift" theorem derivation.
*   **Context Management**: 
    *   Adaptive context compaction for long-running tasks.
    *   Vector-based memory injection for cross-session knowledge retrieval.
*   **Human-in-the-Loop (HITL)**: Mandatory security gate for destructive system commands or git operations.

## 2. Desktop & OS Automation
*   **Dual-Layer Vision Engine**: 
    *   Primary: `nut-js` for high-performance screen scanning.
    *   Fallback: Native PowerShell screenshot engine for extreme environment resilience.
*   **Input Control**: Precision mouse movement, click types (single, double, right), and keyboard emulation.
*   **UI Element Discovery**: Text-to-coordinate mapping via `VisualProbe` for interacting with non-accessible legacy apps.
*   **Filesystem Management**: Native cross-platform tools for directory listing, file reading/writing, and pattern-based searching.

## 3. Web & Browser Intelligence
*   **User-Isolated Browsing**: Spawns independent Puppeteer instances for each user (Telegram/Web/Discord).
*   **Persistent Identity**: Support for stable `userDataDir` profiles, allowing the agent to persist logins (Gmail, GitHub, etc.) across sessions.
*   **Advanced Web Tools**: Full support for navigation, screenshotting, form-filling, element clicking, and custom JavaScript evaluation.
*   **Headless/Headed Toggle**: User-configurable visibility (defaults to headed for manual login intervention).

## 4. MCP Ecosystem (Extensibility)
*   **Dynamic Tool Injection**: Hot-pluggable Model Context Protocol (MCP) servers.
*   **Native Integrations**:
    *   **GitHub**: Repository management, issue tracking, and PR automation.
    *   **Fetch**: Lightweight web scraping and API interaction without browser overhead.
    *   **FileSystem**: Deep system access with security sandboxing.
    *   **NotebookLM**: RAG-based research and document synthesis.

## 5. Multi-Channel Communication
*   **Web Dashboard**: Real-time Socket.io interface with "Active Session" progress tracking.
*   **Telegram & Discord**: 
    *   Full remote control of the agent via mobile messaging.
    *   Support for approval buttons (HITL) directly within the chat interface.
*   **Voice Interface**:
    *   **STT (Speech-to-Text)**: Process voice commands via Telegram voice notes.
    *   **TTS (Text-to-Speech)**: Auditory responses for hands-free operation.

## 6. Self-Improvement & Theorems
*   **MD Skills**: Hot-reloadeable skills defined in Markdown, allowing the agent to "learn" new logic patterns without code changes.
*   **Logic Shifting**: Ability for the agent to refine its own internal theorems based on execution successes or failures.
