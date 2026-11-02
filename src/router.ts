import type { RouteConfig } from './config/types.ts'

export function matchRoute(routes: RouteConfig[], path: string): RouteConfig | undefined {
  let best: RouteConfig | undefined
  for (const route of routes) {
    if (isUnderPrefix(path, route.path) && (!best || route.path.length > best.path.length)) best = route
  }
  return best
}

export function upstreamPath(route: RouteConfig, url: URL): string {
  const path = route.stripPrefix ? url.pathname.slice(route.path.length) || '/' : url.pathname
  return (path.startsWith('/') ? path : `/${path}`) + url.search
}

function isUnderPrefix(path: string, prefix: string): boolean {
  return prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)
}
