# Skill: Desktop Autonomy & Visual Grounding
name: THEOREM_DESKTOP_AUTONOMY
description: Coordination of visual perception (Eyes) and mechanical execution (Hands) for desktop automation.

## Core Logic
When operating in VISUAL MODE or when standard API/filesystem tools are insufficient, follow the Visual Grounding Protocol:

1. **Environmental Scan**: Use `desktop__scan_screen` to get a high-level orientation of the current desktop state.
2. **Target Localization**: Use `desktop__find_element` with a descriptive query (e.g., "the blue login button", "the search bar next to the logo") to obtain precise (x, y) coordinates.
3. **Mechanical Execution**:
   - Use `desktop__mouse_move` with the coordinates obtained from Step 2.
   - Use `desktop__mouse_click` to interact with the element.
   - Use `desktop__keyboard_type` for data entry.
4. **Visual Verification**: Use `desktop__take_snapshot` after interaction to confirm the UI state has transitioned as expected. Do NOT assume success based on tool return values alone.

## Failure Mitigation
- **Coordinate Drift**: If a click fails to trigger the expected response, re-run `desktop__find_element` as the window may have moved or a pop-up may be blocking the target.
- **Occlusion**: If `scan_screen` reports overlapping windows, use `desktop__keyboard_press` with 'ALT'+'TAB' or 'WIN'+'D' to clear the workspace.
- **Input Lag**: Allow for a brief pause (implied between turns) before verifying snapshots to account for UI rendering time.

## When to Use
- Interacting with legacy applications without APIs.
- Verifying UI changes in real-time.
- Navigating complex multi-window workflows that require visual context.
