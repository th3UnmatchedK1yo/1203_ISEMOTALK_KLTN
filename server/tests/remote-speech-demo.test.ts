import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
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

function makeTestWav(channels = 1) {
  // Unit-test fixture ONLY. This is a generated signal, never a source of user demo speech.
  const rate = 16000
  const n = rate * 2
  const data = Buffer.alloc(n * channels * 2)
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++)
    data.writeInt16LE(Math.round(Math.sin(i / 100 + c * 0.3) * 1000), (i * channels + c) * 2)
  const b = Buffer.alloc(44 + data.length)
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * 2, 28)
  b.writeUInt16LE(channels * 2, 32); b.writeUInt16LE(16, 34)
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
    // Stub ffprobe JSON for the two TEST fixtures; the real deployment
    // uses system ffprobe to validate duration, 16kHz and channel count.
    const ffprobe = path.join(bin, 'ffprobe')
    writeFileSync(ffprobe, '#!/bin/sh\ncase "$*" in\n  *phone_01.wav*) echo \'{"streams":[{"channels":2,"sample_rate":"16000"}],"format":{"duration":"2.0"}}\' ;;\n  *) echo \'{"streams":[{"channels":1,"sample_rate":"16000"}],"format":{"duration":"2.0"}}\' ;;\nesac\n')
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
    const datahiveDir = path.join(home, 'services/isemotalk-private/datasets/datahive-vi-call-excerpts')
    const phoneAudio = path.join(datahiveDir, 'audio/phone_01.wav')
    mkdirSync(path.dirname(phoneAudio), { recursive: true })
    // Stereo fixture for byte-level verification only (NOT real dialogue).
    const phoneInput = makeTestWav(2)
    writeFileSync(phoneAudio, phoneInput)
    const checksum = createHash('sha256').update(phoneInput).digest('hex')
    writeFileSync(path.join(datahiveDir, 'source_manifest.json'), JSON.stringify({
      dataset_id: 'datahiveai/multilingual-conversations-sample',
      dataset_revision: 'd'.repeat(40),
      dataset_license: 'cc-by-4.0',
      source_type: 'consented_human_phone_conversation_not_call_center',
      transcripts_available: false,
      records: [{
        id: 'datahive:vi:01', wav: phoneAudio, source_mp3: 'preview/vi_000001.mp3',
        source_sha256: 'a'.repeat(64), audio_sha256: checksum,
        human_recorded: true, transcript: null,
      }],
    }))
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
    expect(list.total).toBe(2)
    const fosd = list.items.find(item => item.title.includes('GIỌNG THẬT'))
    const humanPhone = list.items.find(item => item.title.includes('HỘI THOẠI ĐIỆN THOẠI THẬT'))
    expect(fosd).toBeDefined()
    expect(humanPhone).toBeDefined()
    expect(list.items.every(item => item.provenance === 'imported')).toBe(true)
    const id = fosd!.id
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
    const phone = await (await fetch('http://127.0.0.1:' + port + '/api/calls/' + humanPhone!.id)).json() as {
      utterances: unknown[]; channels: number;
      stageLog: Array<{stage: string; state: string; detail: string}>
    }
    expect(phone.utterances).toHaveLength(0)
    expect(phone.channels).toBe(2)
    expect(phone.stageLog.find(step => step.stage === 'transcribe')?.detail).toContain('KHÔNG cung cấp transcript')
    expect(phone.stageLog.find(step => step.stage === 'emotion')?.state).toBe('skipped')
    const phoneResponse = await fetch('http://127.0.0.1:' + port + '/api/calls/' + humanPhone!.id + '/audio')
    expect(phoneResponse.status).toBe(200)
    expect(Buffer.from(await phoneResponse.arrayBuffer())).toEqual(phoneInput)
    expect(readFileSync(productionMarker, 'utf8')).toBe('not touched')
    expect(existsSync(path.join(operational, 'isemotalk.db'))).toBe(false)
    expect(existsSync(path.join(home, 'services/isemotalk-speech-demo/isemotalk.db'))).toBe(true)
    child.kill('SIGTERM')
  }, 35000)
})
