import { startMockUpstream } from '../test/mock-upstream.ts'

const PORTS = [3001, 3002, 3003, 3004, 3005, 3006]

for (const port of PORTS) {
  const mock = await startMockUpstream(`mock-${port}`, port)
  console.log(`mock upstream on ${mock.url}`)
}
