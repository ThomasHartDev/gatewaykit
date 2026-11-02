export interface UpstreamTarget {
  url: string
  weight: number
}

export interface RouteConfig {
  path: string
  methods: string[]
  stripPrefix: boolean
  targets: UpstreamTarget[]
  timeoutMs: number
}

export interface GatewayConfig {
  port: number
  globalTimeoutMs: number
  routes: RouteConfig[]
  warnings: string[]
}
