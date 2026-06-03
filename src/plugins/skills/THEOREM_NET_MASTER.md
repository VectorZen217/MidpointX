---
name: THEOREM_NET_MASTER
description: Consolidated network operation patterns — HTTP fallbacks via system commands and browser fallback for unavailable automation tools. Supersedes THEOREM_NET_02, THEOREM_NET_03.
category: domain
---

# Logic Shift: THEOREM_NET_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_NET_02, THEOREM_NET_03

## Pattern 1: HTTP Fetch via System Command Fallback (from THEOREM_NET_02)
**Discovered Pattern:** Fetching data from a URL when a direct HTTP client tool is unavailable.

**Optimized Approach:** Utilize `execute_system_command` with `curl` or `Invoke-WebRequest` to perform HTTP requests when a dedicated HTTP fetch tool is not available. The output can then be processed by subsequent tools or string manipulation. This ensures task completion despite tool limitations.

## Pattern 2: Open URL in Browser When Automation Tools Fail (from THEOREM_NET_03)
**Discovered Pattern:** Need to extract website content but direct browser automation tools are unavailable or fail.

**Optimized Approach:** Use a system command to open the URL in the default browser as a fallback when browser automation tools fail (e.g., 'Unknown tool: navigate'). If content extraction is still needed and no direct tool exists, inform the user about the limitation and request alternative methods or tools. Do not retry failed browser automation tools indefinitely.
