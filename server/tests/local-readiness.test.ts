import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const assetPath = '/assets/demo-fixture.js'
const appHtml = '<!doctype html><html><head><title>ISEmoTalk · QA sau cuộc gọi</title></head><body><div id="root"></div><script type="module" src="/assets/demo-fixture.js"></script></body></html>'
const appScript = 'console.log("Xin chào — kiểm tra UTF-8")'
const component = { adapter: 'mock', ready: true, mock: true, verified: false, detail: 'Explicit test fixture, not a model.' }
const health = { status: 'ok', mode: 'mock', device: 'cpu', ffmpeg: true, components: { asr: component, diarization: component, ser: component } }
const systemStatus = { api: 'ok', inference: { reachable: true, ...health } }
const servers: Server[] = []
const directories: string[] = []

type Reply = { status?: number; body: unknown; type?: string; method?: string }

async function serve(routes: Record<string, Reply>) {
  const server = createServer((req, res) => {
    const route = routes[req.url ?? '/'] ?? { status: 404, body: { error: 'Fixture route not found' } }
    if (req.method !== (route.method ?? 'GET')) {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Wrong method for fixture route' }))
      return
    }
    res.writeHead(route.status ?? 200, { 'Content-Type': route.type ?? 'application/json' })
    res.end(typeof route.body === 'string' ? route.body : JSON.stringify(route.body))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected loopback server address')
  return { url: `http://127.0.0.1:${address.port}`, server }
}

async function close(server: Server) {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

async function unavailableUrl() {
  const endpoint = await serve({})
  await close(endpoint.server)
  return endpoint.url
}

async function fixture(options: { web?: Record<string, Reply>; api?: Record<string, Reply>; inference?: Record<string, Reply>; build?: boolean } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'isemo-readiness-'))
  directories.push(dir)
  mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  for (const script of ['check-demo.mjs', 'demo-build.mjs']) {
    copyFileSync(path.join(projectRoot, 'scripts', script), path.join(dir, 'scripts', script))
  }
  if (options.build !== false) {
    mkdirSync(path.join(dir, 'dist/assets'), { recursive: true })
    writeFileSync(path.join(dir, 'dist/index.html'), appHtml)
    writeFileSync(path.join(dir, 'dist/assets/demo-fixture.js'), appScript)
    writeFileSync(path.join(dir, 'dist/demo-build.json'), JSON.stringify({ version: 1, apiBaseUrl: '' }))
  }
  const api = await serve({
    '/api/system/status': { body: systemStatus },
    '/api/calls?pageSize=5': { body: { items: [], total: 0 } },
    ...options.api,
  })
  const inference = await serve({ '/v1/health': { body: health }, ...options.inference })
  const web = await serve({
    '/': { body: appHtml, type: 'text/html' },
    [assetPath]: { body: appScript, type: 'text/javascript' },
    '/api/system/status': { body: systemStatus },
    ...options.web,
  })
  return {
    dir,
    env: { ...process.env, ISEMO_API_URL: api.url, INFERENCE_URL: inference.url, ISEMO_WEB_URL: web.url },
  }
}

function runCheck(dir: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    execFile(process.execPath, [path.join(dir, 'scripts/check-demo.mjs'), ...args], { cwd: dir, env, timeout: 12_000 }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== 'number')) reject(error)
      else resolve({ code: typeof error?.code === 'number' ? error.code : 0, output: stdout + stderr })
    })
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.listening ? close(server) : undefined))
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('local demo readiness CLI', () => {
  it('fails when the frontend is stopped even with a build and healthy API and inference', async () => {
    const f = await fixture()
    f.env.ISEMO_WEB_URL = await unavailableUrl()
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Web:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('API: kết nối được')
    expect(result.output).toContain('Inference: kết nối được')
  })

  it('accepts the built app, its JavaScript asset, proxy, API and inference while labeling mock models', async () => {
    const f = await fixture()
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(0)
    expect(result.output).toContain('Web: kết nối được')
    expect(result.output).toContain('Web → API: kết nối được')
    expect(result.output).toContain('Inference: kết nối được')
    expect(result.output).toContain('SER: MOCK / mô phỏng')
  })

  it.each([
    ['unrelated HTML', { '/': { body: '<html><title>Other app</title></html>', type: 'text/html' } }],
    ['stale entry asset', { '/': { body: appHtml.replace('demo-fixture.js', 'older-build.js'), type: 'text/html' }, '/assets/older-build.js': { body: 'console.log("old")', type: 'text/javascript' } }],
    ['missing entry asset', { [assetPath]: { status: 404, body: 'Not found', type: 'text/plain' } }],
    ['HTML fallback for JavaScript', { [assetPath]: { body: appHtml, type: 'text/html' } }],
  ] satisfies Array<[string, Record<string, Reply>]>)('rejects a frontend serving %s', async (_name, web) => {
    const f = await fixture({ web })
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Web:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('API: kết nối được')
  })

  it('rejects changed HTML with the same app markers and entry URL', async () => {
    const f = await fixture({ web: { '/': { body: appHtml.replace('<body>', '<body hidden>'), type: 'text/html' } } })
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Web:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('API: kết nối được')
  })

  it('rejects substituted JavaScript served under the correct entry URL', async () => {
    const f = await fixture({ web: { [assetPath]: { body: 'void 0;', type: 'text/javascript' } } })
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Web:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('API: kết nối được')
  })

  it('fails the web proxy independently of a working frontend and direct API', async () => {
    const f = await fixture({ web: { '/api/system/status': { status: 502, body: { error: 'Proxy target is unavailable' } } } })
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Web → API:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('Web: kết nối được')
    expect(result.output).toContain('API: kết nối được')
  })

  it('fails a web proxy reporting unreachable inference despite healthy direct endpoints', async () => {
    const f = await fixture({ web: { '/api/system/status': { body: { api: 'ok', inference: { reachable: false, error: 'Proxy API cannot reach inference' } } } } })
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Web → API:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('Proxy API cannot reach inference')
    expect(result.output).toContain('API: kết nối được')
    expect(result.output).toContain('Inference: kết nối được')
  })

  it('fails when local API-target build metadata is missing', async () => {
    const f = await fixture()
    rmSync(path.join(f.dir, 'dist/demo-build.json'))
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Build giao diện:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('API: kết nối được')
  })

  it('fails a missing build without skipping service diagnostics', async () => {
    const f = await fixture({ build: false })
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Build giao diện:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('Inference: kết nối được')
  })

  it('checks inference directly when the API is stopped', async () => {
    const f = await fixture()
    f.env.ISEMO_API_URL = await unavailableUrl()
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/API:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('Inference: kết nối được')
  })

  it('fails an unavailable direct inference endpoint despite an API reporting reachable inference', async () => {
    const f = await fixture()
    f.env.INFERENCE_URL = await unavailableUrl()
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Inference:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('API: kết nối được')
  })

  it('fails when the API cannot reach inference even though the direct inference endpoint works', async () => {
    const f = await fixture({ api: { '/api/system/status': { body: { api: 'ok', inference: { reachable: false, error: 'Wrong inference configuration' } } } } })
    const result = await runCheck(f.dir, f.env)
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/API → inference:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('Inference: kết nối được')
  })

  it('preserves the strict real-SER exit code for a healthy mock system', async () => {
    const f = await fixture()
    const result = await runCheck(f.dir, f.env, ['--require-real-ser'])
    expect(result.code).toBe(2)
    expect(result.output).toContain('Chưa đạt điều kiện trình bày SER thật đã kiểm chứng')
  })

  it('skips warmup for mock ASR without attempting a model endpoint', async () => {
    const f = await fixture({ inference: { '/v1/warmup': { status: 500, body: { error: 'Mock ASR must not be warmed' } } } })
    const result = await runCheck(f.dir, f.env, ['--warmup-asr'])
    expect(result.code).toBe(0)
    expect(result.output).toContain('Nạp ASR: bỏ qua')
  })

  it('uses POST for supported ASR warmup and reports the returned loaded state', async () => {
    const asr = { adapter: 'faster_whisper', ready: true, mock: false, loaded: false, detail: 'Protocol fixture only; no model loaded by this test.' }
    const initial = { ...health, mode: 'mixed', components: { ...health.components, asr } }
    const warmed = { ...initial, components: { ...initial.components, asr: { ...asr, loaded: true } } }
    const f = await fixture({ inference: {
      '/v1/health': { body: initial },
      '/v1/warmup': { body: warmed, method: 'POST' },
    } })
    const result = await runCheck(f.dir, f.env, ['--warmup-asr'])
    expect(result.code).toBe(0)
    expect(result.output).toContain('loaded=true')
    expect(result.output).not.toContain('Nạp ASR: bỏ qua')
  })

  it('reports warmup failure without presenting the model as loaded', async () => {
    const asr = { adapter: 'faster_whisper', ready: true, mock: false, loaded: false, detail: 'Protocol fixture only.' }
    const f = await fixture({ inference: {
      '/v1/health': { body: { ...health, mode: 'mixed', components: { ...health.components, asr } } },
      '/v1/warmup': { status: 503, body: { detail: { message: 'Local model cache unavailable' } }, method: 'POST' },
    } })
    const result = await runCheck(f.dir, f.env, ['--warmup-asr'])
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/Nạp ASR:.*CHƯA SẴN SÀNG/)
    expect(result.output).toContain('Local model cache unavailable')
    expect(result.output).toContain('loaded=false')
  })

  it.each([
    [true, true, 0],
    [false, true, 2],
    [true, false, 2],
    [true, 'true', 2],
  ])('requires ready=%s and verified=%s from non-mock SER', async (ready, verified, code) => {
    const ser = { adapter: 'checkpoint', ready, mock: false, verified, detail: 'Protocol fixture, not evidence of a real model.' }
    const h = { ...health, mode: 'mixed', status: ready ? 'ok' : 'degraded', components: { ...health.components, ser } }
    const f = await fixture({ inference: { '/v1/health': { body: h } } })
    const result = await runCheck(f.dir, f.env, ['--require-real-ser'])
    expect(result.code).toBe(code)
  })
})
