import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
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

function makeTestWav() {
  // Unit-test fixture ONLY. This is a generated signal, never a source of user demo speech.
  const rate = 16000
  const n = rate * 2
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin(i / 100) * 1000), i * 2)
  const b = Buffer.alloc(44 + data.length)
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(data.length, 40)
  data.copy(b, 44)
  return b
}

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

describe.skipIf(process.platform !== 'linux')('isolated speech source import', () => {
  it('copies pinned dataset recording bytes unchanged, labels no SER, and keeps operational database untouched', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'isemo-speech-demo-'))
    homes.push(home)
    const work = path.join(home, 'services/isemotalk-private/datasets/fpt-fosd-sample')
    const audioDir = path.join(work, 'audio')
    const operational = path.join(home, 'services/isemotalk-data')
    const bin = path.join(home, 'bin')
    mkdirSync(audioDir, { recursive: true })
    mkdirSync(operational, { recursive: true })
    mkdirSync(bin)
    const productionMarker = path.join(operational, 'leave-this-alone.txt')
    writeFileSync(productionMarker, 'not touched')
    // Stub only the external ffprobe duration command; the seeded WAV is a fixture.
    const ffprobe = path.join(bin, 'ffprobe')
    writeFileSync(ffprobe, '#!/bin/sh\nprintf "2\\n"\n')
    chmodSync(ffprobe, 0o755)
    const input = makeTestWav()
    const original = path.join(audioDir, '00000.wav')
    writeFileSync(original, input)
    writeFileSync(path.join(work, 'source_manifest.json'), JSON.stringify({
      dataset_id: 'doof-ferb/fpt_fosd', dataset_revision: 'c'.repeat(40),
      dataset_license: 'cc-by-4.0', split: 'train', parquet_sha256: 'a'.repeat(64),
    }))
    writeFileSync(path.join(work, 'asr_eval.jsonl'), JSON.stringify({
      id: 'fpt-fosd-sample:0', wav: original, text: 'Đây chỉ là transcript của fixture kiểm thử.',
    }) + '\n')
    const port = await freePort()
    const child = spawn(process.execPath, ['scripts/start-remote-speech-demo.mjs'], {
      cwd: root, env: { ...process.env, HOME: home, PORT: String(port), PATH: bin + ':' + process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    let health: any
    for (let n = 0; n < 180; n++) {
      if (child.exitCode !== null) throw Error('Speech launcher exited: ' + output)
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/api/system/status', {
          signal: AbortSignal.timeout(300),
        })
        if (response.ok) { health = await response.json(); break }
      } catch { /* waiting for seeding and API startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(health?.api, output).toBe('ok')
    expect(health.speechDemo).toBe(true)
    expect(health.demoData).toBe(false)
    expect(health.inference.reachable).toBe(false)
    const list = await (await fetch('http://127.0.0.1:' + port + '/api/calls')).json() as {
      total: number; items: Array<{ id: string; title: string; provenance: string }>
    }
    expect(list.total).toBe(1)
    expect(list.items[0].title).toContain('GIỌNG THẬT')
    expect(list.items[0].provenance).toBe('imported')
    const id = list.items[0].id
    const detail = await (await fetch('http://127.0.0.1:' + port + '/api/calls/' + id)).json() as {
      utterances: Array<{ text: string; fused: unknown; acoustic: unknown; lexical: unknown; speaker: string }>;
      stageLog: Array<{stage: string; state: string; detail?: string}>
    }
    expect(detail.utterances).toHaveLength(1)
    expect(detail.utterances[0].text).toContain('transcript')
    expect(detail.utterances[0].fused).toBe(null)
    expect(detail.utterances[0].acoustic).toBe(null)
    expect(detail.utterances[0].lexical).toBe(null)
    expect(detail.utterances[0].speaker).toBe('unknown')
    expect(detail.stageLog.find(s => s.stage === 'emotion')?.state).toBe('skipped')
    expect(detail.stageLog.find(s => s.stage === 'validate')?.detail).toContain('audio_sha256=')
    const audio = await fetch('http://127.0.0.1:' + port + '/api/calls/' + id + '/audio')
    expect(audio.status).toBe(200)
    expect(Buffer.from(await audio.arrayBuffer())).toEqual(input)
    expect(readFileSync(productionMarker, 'utf8')).toBe('not touched')
    expect(existsSync(path.join(operational, 'isemotalk.db'))).toBe(false)
    expect(existsSync(path.join(home, 'services/isemotalk-speech-demo/isemotalk.db'))).toBe(true)
    child.kill('SIGTERM')
  }, 35000)
})
