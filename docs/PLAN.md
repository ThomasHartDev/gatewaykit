# GatewayKit plan

## In scope

The non-negotiables are the first priority, so we need the gateway to parse the config file on startup and for routes to work properly. This includes the health check and returning 405 on methods that aren't allowed for that route. We can start by just printing text that indicates the route was successfully reached.

## Plan

1. Parse the config on startup. A bad config stops the gateway and lists what's wrong. The port comes from the config and defaults to 8080.
2. Routes. `/health` always works, unmatched paths get a 404, wrong methods get a 405, and a matched route returns text saying it was reached.
3. Proxy matched routes to their upstream instead of returning text. Timeouts return 504 and an upstream that's down returns 502.
4. Rate limiting, since it protects every upstream.

Test-first development and a basic CI/CD pipeline that runs before merges should ensure things don't regress.

## If we have more time

- Retries with backoff (only for methods that are safe to repeat)
- API key auth
- Load balancing across multiple targets
- Circuit breaker
- Upstream health checks
- Request and response transforms

Anything in the config we don't build yet gets ignored with a warning, so any valid config still starts.

## Constraints

Standard library plus a YAML parser, so no Express, proxy libraries or Zod. TypeScript on Node 24, which runs the `.ts` files directly.
