---
name: THEOREM_HEALTH_MASTER
description: Comprehensive agent health monitoring, system diagnostics, and recovery protocols.
category: system
schedule: "0 */6 * * *"
---

# Theorem: THEOREM_HEALTH_MASTER

## Justification

A production-grade agent requires constant health monitoring to detect failures early and recover gracefully. This theorem consolidates all health-check patterns into a unified master diagnostic protocol.

## Discovered Pattern

Performing periodic system diagnostics by checking:
- Agent process status (running/responsive)
- LLM API connectivity and rate limits
- Database and persistence layer availability
- Tool registry and MCP server status
- Memory and CPU usage
- Recent error logs and circuit breaker state

## Optimized Approach

### Health Check Protocol (Every 6 Hours)

1. **Process Health**
   - Verify MidpointX process is running and responsive
   - Check if event loop is blocked (monitor task queue depth)
   - Restart if unresponsive after 30 seconds

2. **External Service Health**
   - Ping LLM API (test endpoint with token counting)
   - Check database connectivity (execute SELECT 1)
   - Verify all configured MCP servers are connectable

3. **Resource Health**
   - Check available disk space (>500MB required)
   - Monitor memory usage (<80% threshold)
   - Track CPU usage patterns

4. **Error State Health**
   - Read recent error logs (last 1000 lines)
   - Count errors by type
   - Check if circuit breaker is active
   - Alert if error rate >5%/hour

5. **Recovery Actions**
   - If health check fails: Log critical alert and page operator
   - If memory >90%: Trigger garbage collection + log rotation
   - If API unresponsive: Switch to backup provider (if configured)
   - If database unavailable: Switch to local persistence mode

### Implementation

Use `execute_system_command` to run diagnostics:
```bash
# Check process
ps -ef | grep node | grep midpointx

# Check disk
df -h | awk '{print $5}' | tail -1

# Check memory
free -h | grep Mem

# Check database
sqlite3 midpointx.db "SELECT 1"

# Parse logs
tail -1000 debug.log | grep ERROR | wc -l
```

## Success Criteria

- Health check completes in <30 seconds
- All critical services respond (LLM, DB, MCP)
- Resource usage within acceptable bounds
- Error logs are available and parseable
- Recovery actions execute without errors
