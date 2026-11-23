import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import http, { type Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const servers: Server[] = []
const health = { api: 'ok', previewOnly: true, inference: { reachable: false } }

function responder(web = false, brokenProxy = false) {
  return http.createServer((req, res) => {
    const data = req.url === '/api/system/status' ? { ...health, ...(brokenProxy ? { previewOnly: false } : {}) }
      : req.url === '/api/calls' ? { total: 1, items: [] }
      : req.url === '/api/cases' ? { total: 0, items: [] }
      : req.url === '/api/analytics' ? { status: {}, provenance: {} }
      : null
    if (data) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(data))
      return
    }
    if (web && req.url === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><html><body><div id="root"></div></body></html>')
      return
    }
    res.statusCode = 404
    res.end()
  })
}

async function listen(server: Server) {
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('Unexpected test server binding')
  return address.port
}

async function check(apiPort: number, webPort: number) {
  const proc = spawn(process.execPath, ['scripts/check-remote-mvp.mjs'], {
    cwd: root,
    env: { ...process.env, ISEMO_REMOTE_API_PORT: String(apiPort), ISEMO_MVP_WEB_PORT: String(webPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  proc.stdout?.on('data', chunk => { output += chunk.toString() })
  proc.stderr?.on('data', chunk => { output += chunk.toString() })
  const code = await new Promise<number | null>((resolve, reject) => {
    proc.once('error', reject)
    proc.once('exit', resolve)
  })
  return { code, output }
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

describe('read-only midterm MVP wiring check', () => {
  it('accepts an API-only preview with calls, cases, analytics and Vite proxy', async () => {
    const apiPort = await listen(responder())
    const webPort = await listen(responder(true))
    const result = await check(apiPort, webPort)
    expect(result.code, result.output).toBe(0)
    expect(result.output).toContain('PASS read-only workflow wiring')
    expect(result.output).toContain('NOT proof of ASR/SER/QA')
  }, 12000)

  it('rejects an incorrectly routed Vite API proxy', async () => {
    const apiPort = await listen(responder())
    const webPort = await listen(responder(true, true))
    const result = await check(apiPort, webPort)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('Vite /api proxy does not reach')
  }, 12000)
})
