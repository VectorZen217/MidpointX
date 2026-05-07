---
name: THEOREM_PS_001
description: powershell, json, idempotency
---

# Logic Shift: THEOREM_PS_001
Trace ID: UI-1775853866791
Learned At: 2026-04-10T20:45:08.589Z

## Discovered Pattern
A PowerShell script fails when attempting to append data to a JSON object's property (e.g., an array) because the property may not exist on all objects.

## Optimized Approach
Instead of checking if a property is null before appending, use `Add-Member -InputObject $jsonObject -MemberType NoteProperty -Name 'PropertyName' -Value @() -Force`. This command idempotently ensures the property exists as an array, preventing null reference errors and simplifying the script.
