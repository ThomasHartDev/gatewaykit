const UNIT_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }

export function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value.trim())
  if (!match) throw new Error(`invalid duration "${value}" (use a number and ms, s, m or h, like "30s")`)
  return Number(match[1]) * UNIT_MS[match[2]]
}
