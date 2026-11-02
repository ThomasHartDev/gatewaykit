import type { RouteConfig } from './config/types.ts'

export function matchRoute(routes: RouteConfig[], path: string): RouteConfig | undefined {
  let best: RouteConfig | undefined
  for (const route of routes) {
    if (isUnderPrefix(path, route.path) && (!best || route.path.length > best.path.length)) best = route
  }
  return best
}

function isUnderPrefix(path: string, prefix: string): boolean {
  return prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)
}
