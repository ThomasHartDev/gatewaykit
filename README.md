# GatewayKit

A small config-driven API gateway in TypeScript, using Node's standard library. The only runtime dependency is `yaml`.

## Prerequisites

Node.js 23.6 or newer. It runs the TypeScript files directly, so there's no build step.

## Run it

```bash
npm install
npm start                                  # uses gateway.example.yaml
node src/main.ts path/to/gateway.yaml      # or any other config
GATEWAY_CONFIG=path/to/gateway.yaml node src/main.ts
```

To try the example config by hand, start mock upstreams on ports 3001 to 3006 in another terminal with `npm run mock`, then `curl localhost:8080/api/users/7`. Without the mocks running, proxied routes return 502, which is what an unreachable upstream should look like.

A bad config stops the gateway at startup and lists what's wrong. Config features that aren't built yet print a warning and are ignored.

## Test it

```bash
npm test             # starts the gateway and mock upstreams on random ports, no setup needed
npm run typecheck
```

## Config features

- [x] `gateway.port` (default 8080)
- [x] `gateway.global_timeout` (default 30s)
- [x] `GET /health`, always on
- [x] Config validation, with every problem listed at startup
- [x] `routes[].path`, longest prefix on whole segments (404 when nothing matches)
- [x] `routes[].methods` (405 with an `Allow` header)
- [x] `routes[].strip_prefix`
- [x] `upstream.url`
- [x] `upstream.timeout` (504), unreachable upstream (502)
- [ ] `upstream.targets` load balancing (`balance`, `weight`): uses the first target
- [ ] `global_rate_limit`, `rate_limit`
- [ ] `retry`
- [ ] `auth`
- [ ] `circuit_breaker`
- [ ] `health_check`
- [ ] `request_transform`, `response_transform`

Why it stops there and what comes next is in [DECISIONS.md](DECISIONS.md).
