import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { parseDuration } from './duration.ts'
import type { GatewayConfig, RouteConfig, UpstreamTarget } from './types.ts'

const DEFAULT_PORT = 8080
const DEFAULT_TIMEOUT_MS = 30_000
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

// Valid in the schema but not built yet. They load without error so any config
// that follows the schema still starts; DECISIONS.md explains each one.
const OUT_OF_SCOPE_GATEWAY_KEYS: Record<string, string> = { global_rate_limit: 'rate limiting' }
const OUT_OF_SCOPE_ROUTE_KEYS: Record<string, string> = {
  rate_limit: 'rate limiting',
  retry: 'retries',
  auth: 'API key auth',
  circuit_breaker: 'circuit breaker',
  health_check: 'upstream health checks',
  request_transform: 'request transforms',
  response_transform: 'response transforms',
}

type YamlMap = Record<string, unknown>

export class ConfigError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`invalid gateway config:\n  - ${problems.join('\n  - ')}`)
    this.problems = problems
  }
}

export function loadConfig(filePath: string): GatewayConfig {
  return parseConfig(readFileSync(filePath, 'utf8'))
}

export function parseConfig(yamlText: string): GatewayConfig {
  let raw: unknown
  try {
    raw = parse(yamlText)
  } catch (err) {
    throw new ConfigError([`YAML parse error: ${(err as Error).message}`])
  }

  const reader = new ConfigReader()
  const config = reader.readGateway(raw)
  if (reader.problems.length > 0) throw new ConfigError(reader.problems)
  return config
}

function isMap(value: unknown): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

class ConfigReader {
  readonly problems: string[] = []
  readonly warnings: string[] = []

  readGateway(raw: unknown): GatewayConfig {
    const root = this.map(raw, 'config')
    const gateway = root.gateway === undefined ? {} : this.map(root.gateway, 'gateway')

    const port = gateway.port ?? DEFAULT_PORT
    const portIsValid = typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
    if (!portIsValid) this.problems.push('gateway.port must be an integer from 1 to 65535')

    const globalTimeoutMs = this.duration(gateway.global_timeout, 'gateway.global_timeout') ?? DEFAULT_TIMEOUT_MS
    this.warnOutOfScope(gateway, 'gateway', OUT_OF_SCOPE_GATEWAY_KEYS)

    const rawRoutes = root.routes ?? []
    if (!Array.isArray(rawRoutes)) this.problems.push('routes must be a list')
    const routes = Array.isArray(rawRoutes)
      ? rawRoutes.map((route, i) => this.readRoute(route, `routes[${i}]`, globalTimeoutMs))
      : []

    return { port: portIsValid ? port : DEFAULT_PORT, globalTimeoutMs, routes, warnings: this.warnings }
  }

  private readRoute(raw: unknown, where: string, globalTimeoutMs: number): RouteConfig {
    const route = this.map(raw, where)

    const path = route.path
    const pathIsValid = typeof path === 'string' && path.startsWith('/')
    if (!pathIsValid) this.problems.push(`${where}.path must be a string starting with "/"`)

    const upstream = this.map(route.upstream, `${where}.upstream`)
    this.warnOutOfScope(route, where, OUT_OF_SCOPE_ROUTE_KEYS)

    return {
      path: pathIsValid ? trimTrailingSlash(path) : '/',
      methods: this.methods(route.methods, `${where}.methods`),
      stripPrefix: route.strip_prefix === true,
      targets: this.targets(upstream, `${where}.upstream`),
      timeoutMs: this.duration(upstream.timeout, `${where}.upstream.timeout`) ?? globalTimeoutMs,
    }
  }

  private methods(raw: unknown, where: string): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      this.problems.push(`${where} must be a non-empty list`)
      return []
    }
    const methods = raw.map((m) => String(m).toUpperCase())
    for (const method of methods) {
      if (!HTTP_METHODS.has(method)) this.problems.push(`${where} has an unknown method "${method}"`)
    }
    return methods
  }

  private targets(upstream: YamlMap, where: string): UpstreamTarget[] {
    if (typeof upstream.url === 'string') return [this.target(upstream.url, 1, `${where}.url`)]

    if (!Array.isArray(upstream.targets) || upstream.targets.length === 0) {
      this.problems.push(`${where} needs a "url" or a non-empty "targets" list`)
      return []
    }
    return upstream.targets.map((raw, i) => {
      const target = this.map(raw, `${where}.targets[${i}]`)
      const weight = target.weight ?? 1
      if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 1) {
        this.problems.push(`${where}.targets[${i}].weight must be a positive integer`)
      }
      return this.target(target.url, typeof weight === 'number' ? weight : 1, `${where}.targets[${i}].url`)
    })
  }

  private target(url: unknown, weight: number, where: string): UpstreamTarget {
    if (typeof url !== 'string' || !URL.canParse(url) || !url.startsWith('http://')) {
      this.problems.push(`${where} must be an http:// URL`)
    }
    return { url: String(url), weight }
  }

  private duration(raw: unknown, where: string): number | undefined {
    if (raw === undefined) return undefined
    try {
      return parseDuration(String(raw))
    } catch (err) {
      this.problems.push(`${where}: ${(err as Error).message}`)
      return undefined
    }
  }

  private map(raw: unknown, where: string): YamlMap {
    if (isMap(raw)) return raw
    this.problems.push(`${where} must be a mapping`)
    return {}
  }

  private warnOutOfScope(section: YamlMap, where: string, features: Record<string, string>): void {
    for (const [key, feature] of Object.entries(features)) {
      if (section[key] !== undefined) this.warnings.push(`${where}.${key} (${feature}) is not supported yet and is ignored`)
    }
  }
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}
