import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const api = (process.env.ISEMO_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const inference = (process.env.INFERENCE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
const warmup = process.argv.includes('--warmup-asr')
const requireRealSer = process.argv.includes('--require-real-ser')

async function requestJson(url, method = 'GET', timeout = 10_000) {
  const response = await fetch(url, { method, signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json' } })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { throw new Error(`${url}: phản hồi không phải JSON (HTTP ${response.status}).`) }
  if (!response.ok) throw new Error(body?.detail?.message || body?.error || `${url}: HTTP ${response.status}`)
  return body
}

console.log('ISEmoTalk — kiểm tra trước buổi demo')
console.log(`Thời điểm: ${new Date().toISOString()}`)
console.log(`Build giao diện: ${existsSync(path.join(projectRoot, 'dist/index.html')) ? 'có sẵn (hãy build lại sau khi sửa code)' : 'chưa có; chạy npm run build'}`)
try {
  const system = await requestJson(`${api}/api/system/status`)
  if (system.api !== 'ok') throw new Error('API trả cấu trúc trạng thái không hợp lệ.')
  console.log(`API: kết nối được tại ${api}`)
  if (!system.inference?.reachable) throw new Error(system.inference?.error || 'Chưa kết nối được dịch vụ suy luận.')
  let health = system.inference
  if (warmup) {
    const asr = health.components?.asr
    if (!asr || asr.mock || !['faster_whisper', 'faster-whisper'].includes(asr.adapter)) {
      console.log('Nạp ASR: bỏ qua; chỉ hỗ trợ faster-whisper thật từ cache cục bộ.')
    } else {
      console.log('Đang nạp ASR trong dịch vụ đang chạy. Không tải weights mới…')
      const began = performance.now()
      health = await requestJson(`${inference}/v1/warmup`, 'POST', 120_000)
      console.log(`Nạp model: ${(performance.now() - began).toFixed(0)} ms. Vẫn cần chạy một file ngắn để đo cả suy luận.`)
    }
  }
  for (const name of ['asr', 'diarization', 'ser']) {
    const c = health.components?.[name]
    if (!c) throw new Error(`Thiếu trạng thái ${name}.`)
    const mode = c.adapter === 'none' ? 'chưa có model gán vai người nói' : c.mock ? 'MOCK / mô phỏng' : 'thành phần thật'
    console.log(`${name.toUpperCase()}: ${mode} · ${c.adapter} · ready=${c.ready}${c.loaded === undefined ? '' : ` · loaded=${c.loaded}`}${c.verified === undefined ? '' : ` · verified=${c.verified}`}`)
    console.log(`  ${c.detail}`)
    if (!c.ready) process.exitCode = 1
  }
  console.log(`FFmpeg: ${health.ffmpeg ? 'sẵn sàng' : 'chưa sẵn sàng'}`)
  if (!health.ffmpeg) process.exitCode = 1
  if (requireRealSer && (health.components.ser.mock || !health.components.ser.ready || !health.components.ser.verified)) {
    console.error('Chưa đạt điều kiện trình bày SER thật đã kiểm chứng.')
    process.exitCode = 2
  }
  const began = performance.now()
  const calls = await requestJson(`${api}/api/calls?pageSize=5`)
  if (!Array.isArray(calls.items)) throw new Error('Danh sách cuộc gọi có cấu trúc không hợp lệ.')
  console.log(`Đọc danh sách: ${(performance.now() - began).toFixed(1)} ms · ${calls.total} cuộc gọi trong DB.`)
  console.log('Thời gian đọc API không phải tốc độ ASR/SER. Kiểm tra này không đo độ chính xác mô hình.')
  console.log('Sau bước này: phát audio, seek một câu, lưu đánh giá, tải lại, thử export. Xem docs/DEMO_RUNBOOK.md.')
} catch (error) {
  console.error(`CHƯA SẴN SÀNG: ${error.message}`)
  process.exitCode = 1
}
