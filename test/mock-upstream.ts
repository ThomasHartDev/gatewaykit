import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface MockUpstream {
  url: string
  hits: number
  close: () => Promise<void>
}

// Echoes what it received. Paths ending in /slow?ms=N wait first; paths ending in /status/N reply with N.
export async function startMockUpstream(name = 'upstream', port = 0): Promise<MockUpstream> {
  const mock: MockUpstream = { url: '', hits: 0, close: async () => {} }

  const server: Server = createServer((req, res) => {
    mock.hits++
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://mock')
      const reply = () => {
        const status = Number(/\/status\/(\d{3})$/.exec(url.pathname)?.[1] ?? 200)
        const body = JSON.stringify({
          upstream: name,
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        })
        res.writeHead(status, { 'content-type': 'application/json', connection: 'keep-alive' })
        res.end(body)
      }
      const delayMs = url.pathname.endsWith('/slow') ? Number(url.searchParams.get('ms') ?? 1000) : 0
      if (delayMs > 0) setTimeout(reply, delayMs)
      else reply()
    })
  })

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  mock.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  return mock
}
