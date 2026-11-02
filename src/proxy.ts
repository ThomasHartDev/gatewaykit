import { request, type IncomingHttpHeaders, type IncomingMessage, type OutgoingHttpHeaders } from 'node:http'

// Connection-level headers describe one hop and must not be forwarded (RFC 9110 7.6.1).
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

export class UpstreamError extends Error {
  readonly kind: 'timeout' | 'unreachable'

  constructor(kind: 'timeout' | 'unreachable', message: string) {
    super(message)
    this.kind = kind
  }
}

export interface UpstreamRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: Buffer
  clientIp: string
}

export function sendUpstream(targetUrl: string, upstreamReq: UpstreamRequest, timeoutMs: number): Promise<IncomingMessage> {
  const target = new URL(targetUrl)

  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: target.hostname,
      port: target.port,
      method: upstreamReq.method,
      path: upstreamReq.path,
      headers: forwardedHeaders(upstreamReq, target.host),
    })

    const timer = setTimeout(() => {
      outgoing.destroy(new UpstreamError('timeout', `no response from ${target.host} within ${timeoutMs}ms`))
    }, timeoutMs)

    outgoing.on('response', (res) => {
      clearTimeout(timer)
      resolve(res)
    })
    outgoing.on('error', (err) => {
      clearTimeout(timer)
      reject(err instanceof UpstreamError ? err : new UpstreamError('unreachable', `${target.host}: ${(err as NodeJS.ErrnoException).code ?? err.message}`))
    })
    outgoing.end(upstreamReq.body)
  })
}

export function responseHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  return withoutHopByHop(headers)
}

function forwardedHeaders(upstreamReq: UpstreamRequest, targetHost: string): OutgoingHttpHeaders {
  const headers = withoutHopByHop(upstreamReq.headers)
  const priorForwardedFor = upstreamReq.headers['x-forwarded-for']
  headers['x-forwarded-for'] = priorForwardedFor ? `${priorForwardedFor}, ${upstreamReq.clientIp}` : upstreamReq.clientIp
  headers['x-forwarded-host'] = upstreamReq.headers.host
  headers['x-forwarded-proto'] = 'http'
  headers.host = targetHost
  headers['content-length'] = upstreamReq.body.length
  return headers
}

function withoutHopByHop(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const listedInConnection = String(headers.connection ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
  const result: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(name) && !listedInConnection.includes(name) && value !== undefined) result[name] = value
  }
  return result
}
