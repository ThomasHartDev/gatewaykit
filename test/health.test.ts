import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startGateway, type RunningGateway } from './helpers.ts'

describe('GET /health', () => {
  let gateway: RunningGateway

  before(async () => {
    gateway = await startGateway()
  })
  after(() => gateway.close())

  it('returns 200 with status and whole-second uptime', async () => {
    const res = await fetch(`${gateway.url}/health`)

    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /application\/json/)
    const body = await res.json()
    assert.equal(body.status, 'healthy')
    assert.ok(Number.isInteger(body.uptime_seconds))
  })

  it('returns a JSON 404 for anything else', async () => {
    const res = await fetch(`${gateway.url}/nowhere`)

    assert.equal(res.status, 404)
    assert.equal((await res.json()).error, 'not_found')
  })
})
