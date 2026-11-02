import { createServer, type Server, type ServerResponse } from 'node:http'

export function createGateway(): Server {
  const startedAt = Date.now()

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://gateway')

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { status: 'healthy', uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) })
      return
    }

    sendJson(res, 404, { error: 'not_found', message: `no route matches ${url.pathname}` })
  })
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}
