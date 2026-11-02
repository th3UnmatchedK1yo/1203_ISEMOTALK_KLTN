import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDb } from '../src/db'
import type { Emotion, Prediction } from '../src/domain'
import {
  InferenceError,
  type DiarizeResult,
  type EmotionResult,
  type HealthInfo,
  type InferenceClient,
  type ProbeResult,
  type TranscribeResult,
} from '../src/inference/client'
import { Pipeline } from '../src/pipeline'

/** Deterministic stand-in for the Python service. Not a model — only used to test orchestration. */
export class FakeInference implements InferenceClient {
  failTranscribe = 0
  duration = 20
  segments = [
    { start: 0, end: 5, text: 'Xin chào, tôi có thể giúp gì?', speaker: 'agent' as const },
    { start: 5, end: 10, text: 'Tôi rất bực mình!', speaker: 'customer' as const },
    { start: 10, end: 15, text: 'Tôi xin lỗi bạn.', speaker: 'agent' as const },
  ]
  calls: string[] = []

  async health(): Promise<HealthInfo> {
    const c = { adapter: 'fake', ready: true, mock: true, detail: 'fake' }
    return { status: 'ok', mode: 'mock', device: 'cpu', ffmpeg: true, components: { asr: c, diarization: c, ser: c } }
  }
  async probe(): Promise<ProbeResult> {
    this.calls.push('probe')
    return { duration: this.duration, channels: 2, sampleRate: 16000, peaks: Array(50).fill(0.5) }
  }
  async transcribe(): Promise<TranscribeResult> {
    this.calls.push('transcribe')
    if (this.failTranscribe-- > 0) throw new InferenceError('unavailable', 'Dịch vụ suy luận không khả dụng.')
    return { segments: this.segments, speakerSource: 'channel', provenance: 'mock' }
  }
  async diarize(): Promise<DiarizeResult> {
    this.calls.push('diarize')
    return { speakers: [], method: 'none' }
  }
  async emotion(req: { utterances: { id: string; text: string }[] }): Promise<EmotionResult> {
    this.calls.push('emotion')
    const p = (emotion: Emotion, confidence: number): Prediction => ({ emotion, confidence })
    return {
      provenance: 'mock',
      predictions: req.utterances.map((u) => {
        const angry = u.text.includes('bực')
        return {
          id: u.id,
          acoustic: p(angry ? 'sad' : 'neutral', 0.8),
          lexical: p(angry ? 'angry' : 'neutral', 0.8),
          fused: p(angry ? 'angry' : 'neutral', 0.9),
        }
      }),
    }
  }
}

export function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isemo-test-'))
  const config = loadConfig({ dataDir: dir })
  const db = openDb(':memory:')
  const client = new FakeInference()
  const pipeline = new Pipeline(db, config, client)
  const app = createApp({ db, config, client, pipeline })
  return {
    app,
    db,
    client,
    pipeline,
    config,
    api: request(app),
    cleanup: () => {
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

export const RESULTS_JSON = {
  call: { title: 'Cuộc gọi nhập', agentName: 'Agent A', customerName: 'Khách B' },
  utterances: [
    { speaker: 'agent', start: 0, end: 5, text: 'Chào bạn', acoustic: { emotion: 'neutral', confidence: 0.8 }, lexical: { emotion: 'neutral', confidence: 0.8 }, fused: { emotion: 'neutral', confidence: 0.85 } },
    { speaker: 'customer', start: 5, end: 12, text: 'Tôi rất tức giận', acoustic: { emotion: 'sad', confidence: 0.7 }, lexical: { emotion: 'angry', confidence: 0.9 }, fused: { emotion: 'angry', confidence: 0.88 } },
    { speaker: 'customer', start: 12, end: 20, text: 'Vẫn chưa được giải quyết', fused: { emotion: 'angry', confidence: 0.8 } },
    { speaker: 'customer', start: 20, end: 30, text: 'Quá thất vọng', fused: { emotion: 'sad', confidence: 0.75 } },
  ],
}
