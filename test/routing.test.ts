import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startGateway, type RunningGateway } from './helpers.ts'

describe('routing', () => {
  let gateway: RunningGateway

  before(async () => {
    gateway = await startGateway(`
routes:
  - path: "/api"
    methods: ["GET"]
    upstream:
      url: "http://localhost:3000"
  - path: "/api/users"
    methods: ["GET", "POST"]
    upstream:
      url: "http://localhost:3001"
`)
  })
  after(() => gateway.close())

  async function reached(path: string): Promise<string> {
    return (await fetch(`${gateway.url}${path}`)).text()
  }

  it('reaches a configured route', async () => {
    const res = await fetch(`${gateway.url}/api/users`, { method: 'POST' })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'reached route /api/users\n')
  })

  it('picks the longest matching prefix, on whole path segments only', async () => {
    assert.equal(await reached('/api/users/7?x=1'), 'reached route /api/users\n')
    assert.equal(await reached('/api/usersX'), 'reached route /api\n')
    assert.equal((await fetch(`${gateway.url}/apix`)).status, 404)
  })

  it('routes the path as sent, so a leading // is not read as a host', async () => {
    assert.equal((await fetch(`${gateway.url}//evil.com/api/users`)).status, 404)
  })
})
