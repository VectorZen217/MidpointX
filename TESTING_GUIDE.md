# MidpointX Testing Documentation

This document outlines the testing suite for MidpointX, with a focus on the **Temporal Contextual Observation** and **Photo Injection** systems.

## 1. Automated Test Suite (Jest)

The project uses `jest` for automated testing. Tests are located in the `tests/` directory.

### Running Tests
To run the full test suite:
```bash
npm test
```

### Key Test Files
- **[temporal.test.ts](file:///d:/MidpointX/tests/temporal.test.ts)**: Verifies the FFMPEG-based burst capture and the visual diffing logic. It mocks the system shell to ensure parameters are passed correctly without requiring FFMPEG installed during CI.
- **[state.test.ts](file:///d:/MidpointX/tests/state.test.ts)**: Validates the LIFO memory pruning logic. Ensures that the `visualBuffer` is cleared to prevent VRAM overflow.
- **[graph.test.ts](file:///d:/MidpointX/tests/graph.test.ts)**: Integration tests for the `ChannelRouter`. Ensures that high-fidelity context (photos) from Telegram/Discord reaches the Brain correctly.

---

## 2. Manual Verification Protocols

Since the agent interacts with physical and GUI environments, some features require manual validation.

### A. Temporal Observation Verification
**Goal**: Ensure the agent "sees" UI transitions.
1. Start the agent with a task like: *"Click the Start button and wait for the loading bar to finish."*
2. Observe the logs for `[TEMPORAL PROBE]`.
3. Verify that the agent waits for the transition rather than clicking prematurely.
4. Check `temp/burst_...` directories (if not cleaned up) to see the captured frames.

### B. External Photo Injection
**Goal**: Verify grounding via external media.
1. Open Telegram/Discord and send a photo of a handwritten note saying *"The secret code is 1234"*.
2. Caption the photo: *"What is the code in this image?"*
3. Verify that the `ReflectionActor` logs: `🖼️ [ReflectionActor] Ingesting high-fidelity external context...`.
4. The agent should respond with the correct code based on the image.

### C. VRAM Stability Test
**Goal**: Ensure LIFO pruning works under load.
1. Run a mission with >20 steps (e.g., searching multiple websites).
2. Monitor memory usage.
3. Verify that the system does not crash and the LangGraph state remains under 500KB (since raw images are pruned).

---

## 3. Maintenance & Debugging

- **FFMPEG Issues**: If temporal probes fail, run `ffmpeg -version` in your terminal to ensure it is in your PATH.
- **State Bloat**: If the agent becomes slow, inspect the `visualBuffer` in `src/nodes/executionNodes.ts` to ensure `prunedState` is being returned correctly.
- **Injection Failures**: Check `src/services/telegramService.ts` logs. If photos don't download, ensure the `temp/` directory has write permissions.

---

## 4. Peer Review Hardening (Edge Cases)

Following technical peer review, the following edge cases have been integrated into the test suite:

### A. FFMPEG Timeout Handling
On hardware under heavy I/O pressure, FFMPEG may hang. 
- **Test**: `tests/temporal.test.ts` -> `captureBurst should return TIMEOUT_ERROR`.
- **Protocol**: If a timeout occurs, the agent is instructed to report a failure and avoid hallucinating a state change.

### B. Perceptual Noise Rejection (Transparency)
Windows transparency and sub-pixel rendering can cause minor frame differences.
- **Protocol**: `ScreenCapture.getVisualDiff` uses a 5% delta threshold. Any change below this threshold is reported as "NO SIGNIFICANT CHANGE" to prevent unnecessary replanning loops.

### C. Disciplined Refusal (Null Evidence)
The hallmark of a high-fidelity agent is knowing when it is blind.
- **Test**: `tests/graph_context.test.ts` -> `Refusal logic should trigger for Null Evidence`.
- **Goal**: Verify that when presented with blank or corrupted imagery, the `ReflectionActor` refuses to extract data rather than hallucinating.

---

## 5. A2A (Agent-to-Agent) Trust Protocol

As MidpointX evolves into a "Local Gateway," it enforces a trustless safety handshake for all remote agent collaborations.

### A. The Safety Handshake
Before executing any intent from an external agent (via `api` or `agent` channels), the `ChannelRouter` requires a **Safety Certificate**.
- **Requirement**: The requesting agent must prove a `refusalThreshold` of at least **0.05**.
- **Requirement**: The requesting agent must attest to the `disciplined_refusal` capability.

### B. Proof of Alignment
- **Test**: `tests/graph_context.test.ts` -> `A2A Handshake should reject agents with lax thresholds`.
- **Protocol**: If the certificate is missing or indicates lax safety standards, the handshake is rejected with a `403 Collaboration Denied` signal before the command enters the graph.

### C. Nested Delegation (Chain-of-Custody)
To prevent "Trust Laundering," MidpointX requires full transparency on the request's origin.
- **Requirement**: If a request is delegated from another agent, the `SafetyCertificate` must include the `originatorId`.
- **Validation**: If the `originatorId` is untrusted or unknown, the request is rejected even if the proxy agent is trusted.
- **Test**: `tests/graph_context.test.ts` -> `A2A Handshake should reject Trust Laundering`.
