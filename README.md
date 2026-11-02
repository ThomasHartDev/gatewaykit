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

A bad config stops the gateway at startup and lists what's wrong. Config features that aren't built yet print a warning and are ignored.

## Test it

```bash
npm test
npm run typecheck
```
