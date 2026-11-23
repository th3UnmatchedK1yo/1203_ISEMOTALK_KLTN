import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const children: ChildProcess[] = []
const homes: string[] = []
afterEach(async () => {
  for (const c of children.splice(0)) {
    if (c.exitCode === null && !c.killed) c.kill('SIGTERM')
  }
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

async function freePort() {
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

describe.skipIf(process.platform !== 'linux')('isolated FTISU midterm presentation', () => {
  it('seeds only a dedicated mock-data directory and serves preview without Python', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'isemo-midterm-test-'))
    homes.push(home)
    const operational = path.join(home, 'services/isemotalk-data')
    mkdirSync(operational, { recursive: true })
    const marker = path.join(operational, 'leave-this-alone.txt')
    writeFileSync(marker, 'production-is-untouched', 'utf8')
    const port = await freePort()
    const child = spawn(process.execPath, ['scripts/start-remote-midterm-demo.mjs'], {
      cwd: root,
      env: { ...process.env, HOME: home, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let logs = ''
    child.stdout?.on('data', chunk => { logs += chunk.toString() })
    child.stderr?.on('data', chunk => { logs += chunk.toString() })
    let status: any
    for (let i = 0; i < 140; i++) {
      if (child.exitCode !== null) throw Error('Midterm demo exited: ' + logs)
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/api/system/status', {
          signal: AbortSignal.timeout(300),
        })
        if (response.ok) { status = await response.json(); break }
      } catch { /* isolate seed/bootstrap may still be running */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(status?.api, logs).toBe('ok')
    expect(status?.previewOnly).toBe(true)
    expect(status?.demoData).toBe(true)
    expect(status?.inference?.reachable).toBe(false)
    const list = await (await fetch('http://127.0.0.1:' + port + '/api/calls')).json() as {
      total: number; items: Array<{id: string; provenance: string; status: string}>
    }
    expect(list.total).toBeGreaterThanOrEqual(12)
    expect(list.items.length).toBeGreaterThan(0)
    expect(list.items.every(item => item.provenance === 'mock')).toBe(true)
    const ready = list.items.find(item => item.status === 'ready')
    expect(ready).toBeDefined()
    const audioResponse = await fetch('http://127.0.0.1:' + port + '/api/calls/' + ready!.id + '/audio')
    expect(audioResponse.status).toBe(200)
    expect(audioResponse.headers.get('content-type')).toContain('audio/wav')
    await audioResponse.arrayBuffer()
    expect(readFileSync(marker, 'utf8')).toBe('production-is-untouched')
    expect(existsSync(path.join(operational, 'isemotalk.db'))).toBe(false)
    expect(existsSync(path.join(home, 'services/isemotalk-midterm-demo/isemotalk.db'))).toBe(true)
    expect(logs).toContain('synthetic tones, NOT speech')
    child.kill('SIGTERM')
  }, 40000)
})
