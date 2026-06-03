---
name: ERROR_RECOVERY
description: Decision tree for when a step returns unexpected results. Classifies error type and prescribes a specific response. Replaces guess-retry-drift behavior. Invoke whenever a step does not match its expected output.
category: error-recovery
---

# ERROR_RECOVERY

When a step returns unexpected output, classify the error type below and apply the matching response exactly. Do not improvise a response before classifying.

## Error Classification

### Transient failure
**Signal:** Timeout, rate limit (HTTP 429), network error, service unavailable (HTTP 503), connection refused  
**Response:** Wait 2 seconds. Retry the exact same step once. If it fails again, invoke ESCALATION_POLICY.

### Wrong output shape
**Signal:** Unexpected format, missing required field, wrong data type, empty response when non-empty expected, result does not match the expected output defined in EXECUTION_GUARD  
**Response:** Re-read the step's input parameters carefully. Formulate one alternative approach (different tool, different argument, different method). Try it once. If still wrong, invoke ESCALATION_POLICY.

### Capability gap
**Signal:** Tool returns "not supported", "cannot", "unsupported operation", or functionally cannot accomplish the request regardless of arguments  
**Response:** Stop. Do not retry. Do not try a different tool without invoking ESCALATION_POLICY first. Report exactly: (1) what was requested, (2) which tool was used, (3) why it cannot fulfill the request.

### Permission / auth failure
**Signal:** HTTP 401, HTTP 403, "access denied", "unauthorized", credential error, missing permissions  
**Response:** Stop immediately. Do not retry. Invoke ESCALATION_POLICY. Report what credentials or permissions are required.

### Ambiguous result
**Signal:** Step completed without an error, but output is not clearly success or clearly failure  
**Response:** Run TASK_CHECKPOINT verification against the success criteria defined in EXECUTION_GUARD step 4. If verification passes, treat as success and continue. If verification fails, treat as "wrong output shape" above.

## Hard Limits
- Maximum **2 retries** per step (including the initial attempt)
- Maximum **1 alternative approach** per step
- If both are exhausted without resolution → invoke ESCALATION_POLICY immediately
