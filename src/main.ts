import { ConfigError, loadConfig } from './config/load.ts'
import type { GatewayConfig } from './config/types.ts'
import { createGateway } from './server.ts'

const configPath = process.argv[2] ?? process.env.GATEWAY_CONFIG
if (!configPath) {
  console.error('usage: node src/main.ts <config.yaml>   (or set GATEWAY_CONFIG)')
  process.exit(1)
}

let config: GatewayConfig
try {
  config = loadConfig(configPath)
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : `could not read ${configPath}: ${(err as Error).message}`)
  process.exit(1)
}

for (const warning of config.warnings) console.warn(`warning: ${warning}`)

const server = createGateway(config)
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `port ${config.port} is already in use` : `server error: ${err.message}`)
  process.exit(1)
})
server.listen(config.port, () => console.log(`GatewayKit listening on :${config.port}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
