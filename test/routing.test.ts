import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startGateway, type RunningGateway } from './helpers.ts'
import { startMockUpstream, type MockUpstream } from './mock-upstream.ts'

describe('routing', () => {
  let api: MockUpstream
  let users: MockUpstream
  let gateway: RunningGateway

  before(async () => {
    api = await startMockUpstream('api')
    users = await startMockUpstream('users')
    gateway = await startGateway(`
routes:
  - path: "/api"
    methods: ["GET"]
    upstream:
      url: "${api.url}"
  - path: "/api/users"
    methods: ["GET", "POST"]
    upstream:
      url: "${users.url}"
`)
  })
  after(async () => {
    await gateway.close()
    await Promise.all([api.close(), users.close()])
  })

  async function upstreamFor(path: string): Promise<string> {
    return (await (await fetch(`${gateway.url}${path}`)).json()).upstream
  }

  it('picks the longest matching prefix, on whole path segments only', async () => {
    assert.equal(await upstreamFor('/api/users/7?x=1'), 'users')
    assert.equal(await upstreamFor('/api/usersX'), 'api')
    assert.equal((await fetch(`${gateway.url}/apix`)).status, 404)
  })

  it('routes the path as sent, so a leading // is not read as a host', async () => {
    assert.equal((await fetch(`${gateway.url}//evil.com/api/users`)).status, 404)
  })

  it('returns 405 with an Allow header for a method the route does not list', async () => {
    const res = await fetch(`${gateway.url}/api/users`, { method: 'DELETE' })

    assert.equal(res.status, 405)
    assert.equal(res.headers.get('allow'), 'GET, POST')
    assert.equal((await res.json()).error, 'method_not_allowed')
  })
})
