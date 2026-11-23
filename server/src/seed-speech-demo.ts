// Populate a separate FTISU SQLite workspace using UNMODIFIED, PINNED,
// real recorded Vietnamese WAVs from existing FOSD / FLEURS extracts.
// Optional OneVoice WAVs contain intelligible *synthetic speech*, and remain
// explicitly labeled TTS. This script NEVER invents SER/QA outputs.
// CPU/filesystem only; does not launch Python inference or use CUDA.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { loadConfig } from './config'
import { openDb } from './db'
import * as repo from './repo'
import type { StageEntry } from './domain'

type AudioReference = {
  id: string
  text: string
  wav: string
  title: string
  dataset: string
  license: string
  revision: string
  origin: 'human_recording' | 'synthetic_speech'
  split: string
}
const config = loadConfig()
const home = process.env.HOME
if (!home) throw Error('HOME missing')
const datasetDir = path.resolve(home, 'services/isemotalk-private/datasets')
const MAX_CLIP_BYTES = 30 * 1024 * 1024
const MAX_DURATION = 240
function boundedFile(root: string, rel: string) {
  const candidate = path.resolve(root, rel)
  const realRoot = fs.realpathSync(root)
  const real = fs.realpathSync(candidate)
  if (real !== realRoot && !real.startsWith(realRoot + path.sep))
    throw Error('Dataset file escapes pinned source folder: ' + rel)
  const stat = fs.statSync(real)
  if (!stat.isFile() || stat.size < 1024 || stat.size > MAX_CLIP_BYTES)
    throw Error('Dataset audio file size is not demo-safe: ' + rel)
  if (path.extname(real).toLowerCase() !== '.wav')
    throw Error('Expected existing WAV, never synthesize a replacement: ' + real)
  return real
}
function loadJson(file: string): Record<string, unknown> {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!obj || typeof obj !== 'object' || Array.isArray(obj))
    throw Error('Invalid source manifest: ' + file)
  return obj
}
function lines(file: string) {
  return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>)
}
function validRevision(rev: unknown) {
  return typeof rev === 'string' && /^[a-f0-9]{40}$/.test(rev)
}
function loadRecorded(folder: string, name: string, split: string, limit: number, label: string) {
  const root = path.join(datasetDir, folder)
  const manifestPath = path.join(root, 'source_manifest.json')
  const recordsPath = path.join(root, 'asr_eval.jsonl')
  if (!fs.existsSync(manifestPath) || !fs.existsSync(recordsPath)) {
    console.warn('[speech-demo] Not available:', name, '; skipping')
    return [] as AudioReference[]
  }
  const m = loadJson(manifestPath)
  if (m.dataset_id !== name || m.split !== split || m.dataset_license !== 'cc-by-4.0' ||
      !validRevision(m.dataset_revision) || !/^[a-f0-9]{64}$/.test(String(m.parquet_sha256))) {
    throw Error('Refusing unpinned/mismatched real-recording dataset manifest: ' + folder)
  }
  const result: AudioReference[] = []
  const used = new Set<string>()
  for (const entry of lines(recordsPath)) {
    if (result.length >= limit) break
    const id = String(entry.id || '')
    const text = String(entry.text || '').trim()
    const wav = String(entry.wav || '')
    if (!id.startsWith(folder + ':') || !text || text.length > 4000 ||
        used.has(id) || !wav) continue
    used.add(id)
    try {
      const audio = boundedFile(root, wav)
      result.push({
        id, text, wav: audio, dataset: name, license: 'CC BY 4.0',
        revision: String(m.dataset_revision), origin: 'human_recording', split,
        title: 'GIỌNG THẬT · ' + label + ' · ' + id.split(':').at(-1),
      })
    } catch (error) {
      console.warn('[speech-demo] Skipping invalid real audio', id, String(error))
    }
  }
  return result
}
function loadOneVoice(limit: number) {
  const root = path.join(datasetDir, 'onevoice')
  const meta = path.join(root, 'source_manifest.json')
  const records = path.join(root, 'records.jsonl')
  if (!fs.existsSync(meta) || !fs.existsSync(records)) return [] as AudioReference[]
  const m = loadJson(meta)
  if (m.dataset !== 'nhatminh/OneVoice' || m.license !== 'cc-by-nc-sa-4.0' ||
      m.synthetic !== true || !validRevision(m.commit))
    throw Error('Refusing OneVoice without pinned synthetic-data provenance')
  const result: AudioReference[] = []
  for (const item of lines(records)) {
    if (result.length >= limit) break
    const rel = String(item.audio_relpath || '')
    const text = String(item.text || '').trim()
    if (!rel || !text || text.length > 4000) continue
    try {
      const wav = boundedFile(root, rel)
      const id = rel.replaceAll(/[\\/]+/g, '-')
      result.push({
        id, text, wav, dataset: 'nhatminh/OneVoice',
        license: 'CC BY-NC-SA 4.0 (noncommercial)',
        revision: String(m.commit), origin: 'synthetic_speech', split: 'source_metadata',
        title: 'TTS TỔNG HỢP · OneVoice · ' + String(result.length + 1).padStart(2, '0'),
      })
    } catch (error) {
      console.warn('[speech-demo] Skipping unavailable OneVoice audio', rel, String(error))
    }
  }
  return result
}
function probe(wav: string) {
  const output = execFileSync('ffprobe', [
    '-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',wav,
  ], { encoding: 'utf8', timeout: 12000 }).trim()
  const duration = Number(output)
  if (!Number.isFinite(duration) || duration < 1 || duration > MAX_DURATION)
    throw Error('Unsupported recording duration ' + output + ' (' + wav + ')')
  return duration
}
function sha(file: string) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
const refs = [
  ...loadRecorded('fpt-fosd-sample', 'doof-ferb/fpt_fosd', 'train', 7, 'FPT FOSD'),
  ...loadRecorded('fleurs-vi-test', 'google/fleurs', 'test', 6, 'FLEURS vi'),
  ...loadOneVoice(4),
]
if (!refs.some(r => r.origin === 'human_recording'))
  throw Error('NO REAL HUMAN RECORDINGS: first run the existing FOSD/FLEURS dataset downloader. Never substitute tones or generated speech.')
const db = openDb(config.dbFile)
let created = 0, reused = 0, skipped = 0
try {
  const exists = db.prepare('SELECT id FROM calls WHERE title=? LIMIT 1')
  for (const rec of refs) {
    if (exists.get(rec.title)) { reused++; continue }
    let duration: number
    try { duration = probe(rec.wav) }
    catch (error) { skipped++; console.warn('[speech-demo] Unusable recording', rec.id, String(error)); continue }
    const callId = repo.nextCallId(db)
    const dir = path.join(config.uploadsDir, callId)
    const relative = path.join(callId, 'audio.wav')
    fs.mkdirSync(dir, { recursive: false })
    try {
      const dst = path.join(dir, 'audio.wav')
      fs.copyFileSync(rec.wav, dst, fs.constants.COPYFILE_EXCL)
      if (sha(rec.wav) !== sha(dst)) throw Error('Source and imported audio SHA256 mismatch: ' + rec.id)
      const stages: StageEntry[] = [
        { stage: 'validate', state: 'done', detail: 'File WAV gốc từ tập dữ liệu đã ghim revision; không tạo âm thanh giả' },
        { stage: 'transcribe', state: 'skipped', detail: 'Transcript tham chiếu đi kèm nguồn dữ liệu, KHÔNG chạy ASR' },
        { stage: 'diarize', state: 'skipped', detail: 'Không có vai trò nhân viên/khách hàng; giữ unknown' },
        { stage: 'emotion', state: 'skipped', detail: 'Chưa chạy SER; không tự gán nhãn cảm xúc' },
        { stage: 'finalize', state: 'done', detail: 'File tiếng nói + transcript tham chiếu, không có kết quả AI' },
      ]
      const note = [
        'NGUỒN: ' + rec.dataset + ' · ' + rec.split,
        'Revision: ' + rec.revision,
        'License: ' + rec.license,
        rec.origin === 'human_recording'
          ? 'Tiếng nói do con người ghi âm; KHÔNG phải cuộc gọi tổng đài.'
          : 'Giọng nói TTS TỔNG HỢP theo kịch bản; KHÔNG phải cuộc gọi khách hàng thật.',
        'Transcript gốc của dataset (không phải ASR dự đoán).',
        'Chưa chạy mô hình SER; không có điểm cảm xúc được bịa.',
      ].join('\n')
      db.transaction(() => {
        repo.insertCall(db, {
          id: callId, title: rec.title, agentName: '', customerName: '',
          callDate: new Date().toISOString(), source: 'transcript_import', agentChannel: 0,
          audioFile: relative, audioName: path.basename(rec.wav), audioMime: 'audio/wav',
          provenance: 'imported', speakerSource: 'unassigned', stageLog: stages,
        })
        repo.replaceUtterances(db, callId, [{
          text: rec.text, speaker: 'unknown', start: 0, end: Math.round(duration * 100) / 100,
          acoustic: null, lexical: null, fused: null,
        }])
        repo.updateCall(db, callId, {
          status: 'ready', progress: 100, duration, channels: 1,
          overallNote: note,
        })
        repo.refreshDerived(db, callId)
      })()
      created++
      console.log('[speech-demo] imported', callId, rec.title, duration.toFixed(1)+'s', 'audio sha256='+sha(rec.wav).slice(0,12))
    } catch (error) {
      // Roll back only the new call folder; never delete older calls or datasets.
      fs.rmSync(dir, { recursive: true, force: true })
      throw error
    }
  }
} finally {
  db.close()
}
console.log('[speech-demo] DONE: imported='+created+' existing='+reused+' skipped='+skipped+' from pinned human-recorded datasets and optional labeled TTS')
console.log('[speech-demo] Real audio playback and dataset transcripts only; NO claim of SER/QA inference.')
