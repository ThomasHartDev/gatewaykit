import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { GatewayConfig, RouteConfig } from './config/types.ts'
import { buildGuards } from './guards.ts'
import { responseHeaders, sendUpstream, UpstreamError } from './proxy.ts'
import { matchRoute, upstreamPath } from './router.ts'

const MAX_BODY_BYTES = 1_048_576

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

    proxyRequest(req, res, route, url).catch((err: unknown) => {
      console.error(`unexpected error on ${req.method} ${url.pathname}:`, err)
      if (res.headersSent) res.destroy()
      else sendJson(res, 500, { error: 'internal_error', message: 'the gateway failed to handle this request' })
    })
  })
}

async function proxyRequest(req: IncomingMessage, res: ServerResponse, route: RouteConfig, url: URL): Promise<void> {
  const body = await readBody(req, MAX_BODY_BYTES)
  if (!body) {
    sendJson(res, 413, { error: 'payload_too_large', message: `request bodies are limited to ${MAX_BODY_BYTES} bytes` })
    return
  }

  try {
    const upstreamRes = await sendUpstream(
      route.targets[0].url,
      {
        method: req.method ?? 'GET',
        path: upstreamPath(route, url),
        headers: req.headers,
        body,
        clientIp: (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, ''),
      },
      route.timeoutMs,
    )
    res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders(upstreamRes.headers))
    upstreamRes.pipe(res)
    upstreamRes.on('error', () => res.destroy())
    res.on('close', () => upstreamRes.destroy())
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err
    if (err.kind === 'timeout') sendJson(res, 504, { error: 'gateway_timeout', message: err.message })
    else sendJson(res, 502, { error: 'bad_gateway', message: err.message })
  }
}

function readBody(req: IncomingMessage, limitBytes: number): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limitBytes) {
        req.pause()
        resolve(undefined)
      } else {
        chunks.push(chunk)
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { ...headers, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}
