import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const workers: ChildProcess[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const c of workers.splice(0)) {
    if (c.exitCode === null && !c.killed) c.kill('SIGTERM')
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function freePort(): Promise<number> {
  const server = net.createServer()
  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

describe.skipIf(process.platform !== 'linux')('FTISU frontend/API parallel mode', () => {
  it('launches genuine SQLite and API without Python, demo seeding, or GPU service', async () => {
    const port = await freePort()
    const dir = mkdtempSync(path.join(tmpdir(), 'isemo-parallel-'))
    dirs.push(dir)
    const child = spawn(process.execPath, ['scripts/start-remote-api-preview.mjs'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port), ISEMO_DATA_DIR: dir,
        ISEMO_AUTO_SEED: '0', INFERENCE_URL: 'http://127.0.0.1:8113' },
    })
    workers.push(child)
    let output = ''
    child.stdout?.on('data', (part: Buffer) => { output += part.toString() })
    child.stderr?.on('data', (part: Buffer) => { output += part.toString() })
    let body: any = null
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error('API preview exited: ' + output)
      try {
        const res = await fetch('http://127.0.0.1:' + port + '/api/system/status', {
          signal: AbortSignal.timeout(200),
        })
        if (res.ok) { body = await res.json(); break }
      } catch { /* Bootstrap is still starting. */ }
      await new Promise(r => setTimeout(r, 60))
    }
    expect(body?.api, output).toBe('ok')
    expect(body?.inference?.reachable).toBe(false)
    const response = await fetch('http://127.0.0.1:' + port + '/api/calls')
    const calls = await response.json() as {total:number}
    expect(calls.total).toBe(0)
    const cases = await fetch('http://127.0.0.1:' + port + '/api/cases')
    expect(cases.status).toBe(200)
    const blocked = await fetch('http://127.0.0.1:' + port + '/api/calls/upload', { method: 'POST' })
    expect(blocked.status).toBe(503)
    const blockBody = await blocked.json() as {code?:string}
    expect(blockBody.code).toBe('inference_paused_for_training')
    expect(output).toContain('no mock seeding')
    child.kill('SIGTERM')
  }, 15000)
})
