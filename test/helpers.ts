import type { AddressInfo } from 'node:net'
import { createGateway } from '../src/server.ts'

export interface RunningGateway {
  url: string
  close: () => Promise<void>
}

export async function startGateway(): Promise<RunningGateway> {
  const server = createGateway()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
