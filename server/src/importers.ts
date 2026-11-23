import { parse } from 'csv-parse/sync'
import { EMOTIONS, type Emotion, type Prediction, type Speaker } from './domain'
import type { NewUtterance } from './repo'

export class ImportError extends Error {
  constructor(message: string, public details: string[] = []) {
    super(message)
  }
}

const MAX_UTTERANCES = 5000
const MAX_REPORTED_ERRORS = 8
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

const EMOTION_ALIASES: Record<string, Emotion> = {
  neutral: 'neutral', neu: 'neutral', calm: 'neutral', 'bình thường': 'neutral', 'binh thuong': 'neutral', trung: 'neutral', 'trung tính': 'neutral',
  happy: 'happy', hap: 'happy', joy: 'happy', happiness: 'happy', vui: 'happy', 'vui vẻ': 'happy',
  sad: 'sad', sadness: 'sad', 'buồn': 'sad', buon: 'sad',
  angry: 'angry', ang: 'angry', anger: 'angry', 'tức giận': 'angry', 'giận': 'angry', 'tuc gian': 'angry',
}

const SPEAKER_ALIASES: Record<string, Speaker> = {
  agent: 'agent', operator: 'agent', staff: 'agent', 'nhân viên': 'agent', 'nhan vien': 'agent', tdv: 'agent', cskh: 'agent',
  customer: 'customer', client: 'customer', caller: 'customer', 'khách hàng': 'customer', 'khach hang': 'customer', kh: 'customer',
}

export function parseEmotion(v: unknown): Emotion | null {
  if (v == null || v === '') return null
  const key = String(v).trim().toLowerCase()
  if ((EMOTIONS as readonly string[]).includes(key)) return key as Emotion
  return Object.hasOwn(EMOTION_ALIASES, key) ? EMOTION_ALIASES[key] : null
}

export function parseSpeaker(v: unknown): Speaker {
  if (v == null || v === '') return 'unknown'
  const key = String(v).trim().toLowerCase()
  return Object.hasOwn(SPEAKER_ALIASES, key) ? SPEAKER_ALIASES[key] : 'unknown'
}

/** Accepts seconds (12.5), mm:ss(.ms) or hh:mm:ss(.ms). Returns null when invalid. */
export function parseTime(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  const s = String(v).trim().replace(',', '.')
  if (s === '') return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number.isFinite(Number(s)) ? Number(s) : null
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (!m || Number(m[3]) >= 60 || (m[1] !== undefined && Number(m[2]) >= 60)) return null
  const seconds = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return Number.isFinite(seconds) ? seconds : null
}

function parseConfidence(v: unknown): number | null {
  if (v == null || v === '') return null
  const raw = String(v).trim()
  const percent = raw.endsWith('%')
  const digits = (percent ? raw.slice(0, -1) : raw).trim()
  if (!digits) return null
  const n = typeof v === 'number' ? v : Number(digits.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  const c = percent || n > 1 ? n / 100 : n
  return c > 1 ? null : c
}

function makePred(emotionRaw: unknown, confRaw: unknown, label: string, row: number, errors: string[]): Prediction | null {
  if ((emotionRaw == null || emotionRaw === '') && (confRaw == null || confRaw === '')) return null
  const emotion = parseEmotion(emotionRaw)
  if (!emotion) {
    errors.push(`Dòng ${row}: cảm xúc "${String(emotionRaw)}" (${label}) không hợp lệ. Dùng: neutral, happy, sad, angry.`)
    return null
  }
  const confidence = parseConfidence(confRaw)
  if (confidence == null) {
    errors.push(`Dòng ${row}: cần độ tin cậy hợp lệ (${label}, 0–1 hoặc 0–100). Không tự gán độ tin cậy khi tệp thiếu điểm số.`)
    return null
  }
  return { emotion, confidence }
}

type Raw = Record<string, unknown>

const pick = (o: Raw, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  return undefined
}

function normalizeRows(rows: unknown[], requireFused: boolean): NewUtterance[] {
  if (rows.length > MAX_UTTERANCES) throw new ImportError(`Tệp có quá nhiều câu nói (tối đa ${MAX_UTTERANCES}).`)
  const errors: string[] = []
  const out: NewUtterance[] = []
  rows.forEach((raw, i) => {
    const row = i + 1
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return void errors.push(`Dòng ${row}: cần một đối tượng câu nói.`)
    const r = raw as Raw
    const start = parseTime(pick(r, 'start', 'start_time', 'startTime', 'begin'))
    const end = parseTime(pick(r, 'end', 'end_time', 'endTime', 'stop'))
    const value = pick(r, 'text', 'transcript', 'content', 'utterance')
    const text = typeof value === 'string' ? value.trim() : ''
    if (start == null || end == null) return void errors.push(`Dòng ${row}: thiếu hoặc sai định dạng thời gian bắt đầu/kết thúc.`)
    if (start < 0 || end <= start) return void errors.push(`Dòng ${row}: thời gian không hợp lệ (cần 0 ≤ bắt đầu < kết thúc).`)
    if (!text) return void errors.push(`Dòng ${row}: nội dung câu nói trống.`)
    if (text.length > 4000) return void errors.push(`Dòng ${row}: nội dung quá dài (tối đa 4000 ký tự).`)

    if (!requireFused) {
      out.push({ speaker: parseSpeaker(pick(r, 'speaker', 'role', 'channel')), text, start, end, acoustic: null, lexical: null, fused: null })
      return
    }

    const nested = (k: string) => (typeof r[k] === 'object' && r[k] !== null ? (r[k] as Raw) : null)
    const ac = nested('acoustic')
    const lx = nested('lexical')
    const fu = nested('fused')
    const acoustic = makePred(ac ? ac.emotion : pick(r, 'acoustic_emotion'), ac ? ac.confidence : pick(r, 'acoustic_confidence'), 'âm thanh', row, errors)
    const lexical = makePred(lx ? lx.emotion : pick(r, 'lexical_emotion'), lx ? lx.confidence : pick(r, 'lexical_confidence'), 'văn bản', row, errors)
    const fused = makePred(
      fu ? fu.emotion : pick(r, 'fused_emotion', 'emotion'),
      fu ? fu.confidence : pick(r, 'fused_confidence', 'confidence'),
      'tổng hợp', row, errors,
    )
    if (requireFused && !fused) errors.push(`Dòng ${row}: thiếu cảm xúc tổng hợp (fused_emotion hoặc emotion).`)

    out.push({ speaker: parseSpeaker(pick(r, 'speaker', 'role', 'channel')), text, start, end, acoustic, lexical, fused })
  })

  if (errors.length) {
    throw new ImportError(
      `Tệp có ${errors.length} lỗi dữ liệu.`,
      errors.slice(0, MAX_REPORTED_ERRORS).concat(errors.length > MAX_REPORTED_ERRORS ? [`… và ${errors.length - MAX_REPORTED_ERRORS} lỗi khác.`] : []),
    )
  }
  if (out.length === 0) throw new ImportError('Tệp không chứa câu nói nào.')
  if (out.length > MAX_UTTERANCES) throw new ImportError(`Tệp có quá nhiều câu nói (tối đa ${MAX_UTTERANCES}).`)
  return out.sort((a, b) => a.start - b.start)
}

export interface ParsedFile {
  utterances: NewUtterance[]
  meta: { title?: string; agentName?: string; customerName?: string; callDate?: string }
}

/**
 * Parses a JSON or CSV file into normalised utterances.
 * `requireFused` is true for "import results" (predictions are the whole point)
 * and false for "import transcript" (predictions, if present, are ignored later).
 */
export function parseUtteranceFile(buf: Buffer, filename: string, requireFused: boolean): ParsedFile {
  if (buf.byteLength > MAX_IMPORT_BYTES) throw new ImportError('Tệp dữ liệu quá lớn (tối đa 10 MB).')
  const text = buf.toString('utf8').replace(/^\uFEFF/, '')
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) {
    let rows: Raw[]
    try {
      rows = parse(text, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, relax_column_count: true, bom: true }) as Raw[]
    } catch (e) {
      throw new ImportError(`Không đọc được tệp CSV: ${(e as Error).message}`)
    }
    return { utterances: normalizeRows(rows, requireFused), meta: {} }
  }
  if (lower.endsWith('.json')) {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new ImportError('Tệp JSON không hợp lệ (không phân tích được cú pháp).')
    }
    if (!data || typeof data !== 'object') throw new ImportError('Tệp JSON cần một đối tượng hoặc mảng câu nói.')
    const obj = (Array.isArray(data) ? { utterances: data } : data) as Raw
    const list = (obj.utterances ?? obj.segments) as unknown
    if (!Array.isArray(list)) throw new ImportError('Tệp JSON cần có mảng "utterances".')
    const call = (typeof obj.call === 'object' && obj.call ? obj.call : obj) as Raw
    const s = (k: string) => (typeof call[k] === 'string' && call[k] ? (call[k] as string) : undefined)
    return {
      utterances: normalizeRows(list as Raw[], requireFused),
      meta: { title: s('title'), agentName: s('agentName'), customerName: s('customerName'), callDate: s('callDate') },
    }
  }
  throw new ImportError('Chỉ hỗ trợ tệp .json hoặc .csv.')
}
