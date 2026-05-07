---
name: THEOREM_WEATHER_01
description: weather, api, curl
---

# Logic Shift: THEOREM_WEATHER_01
Trace ID: UI-1775940673132
Learned At: 2026-04-11T20:51:42.748Z

## Discovered Pattern
User requests current weather conditions for a specific location.

## Optimized Approach
Use `curl wttr.in/<LOCATION>?format=j1` to retrieve structured JSON weather data. This avoids screen scraping and provides machine-readable output directly.
