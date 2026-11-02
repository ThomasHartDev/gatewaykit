import { createServer, type Server, type ServerResponse } from 'node:http'
import type { GatewayConfig } from './config/types.ts'
import { buildGuards } from './guards.ts'
import { matchRoute } from './router.ts'

export function createGateway(config: GatewayConfig): Server {
  const startedAt = Date.now()
  const guardsByRoute = new Map(config.routes.map((route) => [route, buildGuards(route)]))

  return createServer((req, res) => {
    // Prepend the base instead of passing it separately: new URL('//a/b', base) reads 'a' as a host.
    const url = new URL(`http://gateway${req.url?.startsWith('/') ? req.url : '/'}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { status: 'healthy', uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) })
      return
    }

    const route = matchRoute(config.routes, url.pathname)
    if (!route) {
      sendJson(res, 404, { error: 'not_found', message: `no route matches ${url.pathname}` })
      return
    }

    for (const guard of guardsByRoute.get(route) ?? []) {
      const rejection = guard(req)
      if (rejection) {
        sendJson(res, rejection.status, { error: rejection.error, message: rejection.message }, rejection.headers)
        return
      }
    }

    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`reached route ${route.path}\n`)
  })
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { ...headers, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}
