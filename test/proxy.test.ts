import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startGateway, type RunningGateway } from './helpers.ts'
import { startMockUpstream, type MockUpstream } from './mock-upstream.ts'

describe('routing and proxying', () => {
  let users: MockUpstream
  let products: MockUpstream
  let gateway: RunningGateway

  before(async () => {
    users = await startMockUpstream('users')
    products = await startMockUpstream('products')
    gateway = await startGateway(`
gateway:
  global_timeout: "200ms"
routes:
  - path: "/api/users"
    methods: ["GET", "POST"]
    upstream:
      url: "${users.url}"
  - path: "/api/products"
    methods: ["GET"]
    strip_prefix: true
    upstream:
      targets:
        - url: "${products.url}"
        - url: "http://127.0.0.1:1"
  - path: "/down"
    methods: ["GET"]
    upstream:
      url: "http://127.0.0.1:1"
`)
  })
  after(async () => {
    await gateway.close()
    await Promise.all([users.close(), products.close()])
  })

  it('forwards the method, full path, query and body to the upstream', async () => {
    const res = await fetch(`${gateway.url}/api/users/7?expand=orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Ada"}',
    })

    assert.equal(res.status, 200)
    const echo = await res.json()
    assert.equal(echo.upstream, 'users')
    assert.equal(echo.method, 'POST')
    assert.equal(echo.path, '/api/users/7?expand=orders')
    assert.equal(echo.body, '{"name":"Ada"}')
  })

  it('passes the upstream status code through', async () => {
    const res = await fetch(`${gateway.url}/api/users/status/418`)
    assert.equal(res.status, 418)
  })


  it('strips the route prefix when strip_prefix is set', async () => {
    assert.equal((await (await fetch(`${gateway.url}/api/products/123?x=1`)).json()).path, '/123?x=1')
    assert.equal((await (await fetch(`${gateway.url}/api/products`)).json()).path, '/')
  })


  it('sets forwarding headers and the upstream Host', async () => {
    const { headers } = await (await fetch(`${gateway.url}/api/users`)).json()

    assert.equal(headers.host, new URL(users.url).host)
    assert.equal(headers['x-forwarded-for'], '127.0.0.1')
    assert.equal(headers['x-forwarded-proto'], 'http')
  })

  it('returns 504 when the upstream is slower than the timeout', async () => {
    const res = await fetch(`${gateway.url}/api/users/slow?ms=1000`)

    assert.equal(res.status, 504)
    assert.equal((await res.json()).error, 'gateway_timeout')
  })

  it('returns 502 when the upstream cannot be reached', async () => {
    const res = await fetch(`${gateway.url}/down`)

    assert.equal(res.status, 502)
    assert.equal((await res.json()).error, 'bad_gateway')
  })
})
