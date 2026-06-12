# Monolith to Microservices Migration

## Strategy: Strangler Fig Pattern
1. Identify a bounded context.
2. Build the new service.
3. Proxy requests to the new service.
4. Retire the old code.
