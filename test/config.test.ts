import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ConfigError, parseConfig } from '../src/config/load.ts'
import { parseDuration } from '../src/config/duration.ts'

const exampleYaml = readFileSync(new URL('../gateway.example.yaml', import.meta.url), 'utf8')

function problemsFor(yaml: string): string[] {
  try {
    parseConfig(yaml)
  } catch (err) {
    if (err instanceof ConfigError) return err.problems
    throw err
  }
  assert.fail('expected the config to be rejected')
}

describe('parseConfig', () => {
  it('reads the example config', () => {
    const config = parseConfig(exampleYaml)

    assert.equal(config.port, 8080)
    assert.equal(config.globalTimeoutMs, 30_000)
    assert.equal(config.routes.length, 5)

    const [users, orders, products] = config.routes
    assert.deepEqual(users.methods, ['GET', 'POST'])
    assert.equal(users.timeoutMs, 30_000, 'falls back to global_timeout')
    assert.equal(orders.timeoutMs, 5_000, 'route timeout overrides global')
    assert.equal(products.stripPrefix, true)
    assert.deepEqual(products.targets, [
      { url: 'http://localhost:3003', weight: 3 },
      { url: 'http://localhost:3004', weight: 1 },
    ])
  })

  it('warns about configured features that are out of scope', () => {
    const { warnings } = parseConfig(exampleYaml)
    assert.ok(warnings.some((w) => w.includes('routes[3].request_transform')))
  })

  it('defaults the port and timeout when they are omitted', () => {
    const config = parseConfig('routes: []')
    assert.equal(config.port, 8080)
    assert.equal(config.globalTimeoutMs, 30_000)
  })

  it('lists every problem in a malformed config at once', () => {
    const problems = problemsFor(`
gateway:
  port: "eighty"
  global_timeout: "soon"
routes:
  - methods: ["FETCH"]
    upstream: {}
`)
    assert.deepEqual(problems, [
      'gateway.port must be an integer from 1 to 65535',
      'gateway.global_timeout: invalid duration "soon" (use a number and ms, s, m or h, like "30s")',
      'routes[0].path must be a string starting with "/"',
      'routes[0].methods has an unknown method "FETCH"',
      'routes[0].upstream needs a "url" or a non-empty "targets" list',
    ])
  })

  it('rejects text that is not YAML', () => {
    const [problem] = problemsFor('routes: [unclosed')
    assert.match(problem, /^YAML parse error/)
  })
})

describe('parseDuration', () => {
  it('reads ms, s, m and h', () => {
    assert.equal(parseDuration('250ms'), 250)
    assert.equal(parseDuration('30s'), 30_000)
    assert.equal(parseDuration('5m'), 300_000)
    assert.equal(parseDuration('1h'), 3_600_000)
  })

  it('rejects values without a unit', () => {
    assert.throws(() => parseDuration('30'), /invalid duration/)
  })
})
