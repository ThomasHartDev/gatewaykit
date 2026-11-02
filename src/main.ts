import { createGateway } from './server.ts'

const PORT = 8080

const server = createGateway()
server.listen(PORT, () => console.log(`GatewayKit listening on :${PORT}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
