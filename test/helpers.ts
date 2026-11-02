import type { AddressInfo } from 'node:net'
import { parseConfig } from '../src/config/load.ts'
import { createGateway } from '../src/server.ts'

export interface RunningGateway {
  url: string
  close: () => Promise<void>
}

export async function startGateway(yaml = 'routes: []'): Promise<RunningGateway> {
  const server = createGateway(parseConfig(yaml))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
