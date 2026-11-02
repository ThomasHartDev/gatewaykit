import type { IncomingMessage } from 'node:http'
import type { RouteConfig } from './config/types.ts'

export interface Rejection {
  status: number
  error: string
  message: string
  headers?: Record<string, string>
}

// A guard checks a request against its route before the gateway handles it,
// and either rejects it or lets it through.
export type Guard = (req: IncomingMessage) => Rejection | undefined

export function buildGuards(route: RouteConfig): Guard[] {
  return [methodGuard(route)]
}

function methodGuard(route: RouteConfig): Guard {
  const allowed = route.methods.join(', ')
  return (req) =>
    route.methods.includes(req.method ?? '')
      ? undefined
      : {
          status: 405,
          error: 'method_not_allowed',
          message: `${req.method} is not allowed on ${route.path}`,
          headers: { allow: allowed },
        }
}
