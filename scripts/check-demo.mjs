import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocalDemoApiTarget } from './demo-build.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(projectRoot, 'dist')
const api = (process.env.ISEMO_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const inference = (process.env.INFERENCE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
const web = (process.env.ISEMO_WEB_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
const warmup = process.argv.includes('--warmup-asr')
const requireRealSer = process.argv.includes('--require-real-ser')
let failed = false
let realSerFailed = false

async function request(url, method = 'GET', timeout = 10_000, accept = 'application/json') {
  try {
    const response = await fetch(url, { method, signal: AbortSignal.timeout(timeout), headers: { Accept: accept }, redirect: 'error' })
    const bytes = Buffer.from(await response.arrayBuffer())
    return { response, bytes, text: bytes.toString('utf8') }
  } catch (error) {
    const reason = error.cause?.code === 'ECONNREFUSED'
      ? 'không có dịch vụ nhận kết nối (ECONNREFUSED); kiểm tra terminal và cổng đang chạy'
      : error.name === 'TimeoutError' ? 'hết thời gian chờ phản hồi' : error.cause?.message || error.message
    throw new Error(`${url}: ${reason}`)
  }
}

async function requestJson(url, method = 'GET', timeout = 10_000) {
  const { response, text } = await request(url, method, timeout)
  let body
  try { body = JSON.parse(text) } catch { throw new Error(`${url}: phản hồi không phải JSON (HTTP ${response.status}).`) }
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} · ${body?.detail?.message || body?.error || response.statusText}`)
  return body
}

function fail(label, error) {
  failed = true
  console.error(`${label}: CHƯA SẴN SÀNG · ${error.message}`)
}

async function check(label, action) {
  try { return await action() } catch (error) { fail(label, error) }
}

function entryScripts(html) {
  if (!/<title\b[^>]*>[^<]*\bISEmoTalk\b[^<]*<\/title>/i.test(html) || !/<div\b[^>]*\bid\s*=\s*["']root["'][^>]*>/i.test(html)) {
    throw new Error('HTML không có nhận dạng ISEmoTalk và phần tử root; kiểm tra đúng ứng dụng/cổng.')
  }
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].flatMap(([tag]) => {
    const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
    return type?.toLowerCase() === 'module' && src && /\.m?js(?:\?|$)/i.test(src) ? [src] : []
  })
  if (!scripts.length) throw new Error('HTML không tham chiếu JavaScript module đã build; chạy npm run build và npm run preview.')
  return scripts
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function builtEntryDigest(src) {
  const localOrigin = 'http://local-build.invalid'
  const asset = new URL(src, `${localOrigin}/`)
  const file = path.resolve(distDir, `.${decodeURIComponent(asset.pathname)}`)
  const relative = path.relative(distDir, file)
  if (asset.origin !== localOrigin || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`JavaScript entry phải nằm trong dist: ${src}`)
  }
  return digest(readFileSync(file))
}

function validateSystem(system) {
  if (system?.api !== 'ok' || typeof system.inference?.reachable !== 'boolean') throw new Error('API trả cấu trúc trạng thái không hợp lệ.')
  return system
}

function validateHealth(health) {
  if (!['ok', 'degraded'].includes(health?.status) || typeof health?.ffmpeg !== 'boolean') throw new Error('Inference trả cấu trúc health không hợp lệ.')
  for (const name of ['asr', 'diarization', 'ser']) {
    const c = health.components?.[name]
    if (!c || typeof c.adapter !== 'string' || typeof c.ready !== 'boolean' || typeof c.mock !== 'boolean') {
      throw new Error(`Thiếu hoặc sai trạng thái ${name}.`)
    }
  }
  return health
}

console.log('ISEmoTalk — kiểm tra trước buổi demo')
console.log(`Thời điểm: ${new Date().toISOString()}`)
let build
try {
  assertLocalDemoApiTarget(projectRoot)
  const html = readFileSync(path.join(distDir, 'index.html'))
  const scripts = entryScripts(html.toString('utf8'))
  build = { htmlDigest: digest(html), entries: new Map(scripts.map(src => [src, builtEntryDigest(src)])) }
  console.log('Build giao diện: có sẵn (hãy build lại sau khi sửa code)')
} catch (error) {
  fail('Build giao diện', new Error(`Chưa có build hợp lệ; chạy npm run build. ${error.message}`))
}

// Probe each boundary independently: a stopped web server must not hide API or
// inference diagnostics, and the API's health proxy is not a direct health check.
const results = await Promise.all([
  check('Web', async () => {
    const { response, text, bytes } = await request(`${web}/`, 'GET', 10_000, 'text/html')
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error(`${web}/: cần HTML thành công, nhận HTTP ${response.status}.`)
    const servedScripts = entryScripts(text)
    if (build && digest(bytes) !== build.htmlDigest) {
      throw new Error('HTML đang phục vụ khác build cục bộ; khởi động đúng preview và build lại sau khi sửa code.')
    }
    for (const src of servedScripts) {
      const asset = new URL(src, `${web}/`)
      if (asset.origin !== new URL(web).origin) throw new Error('JavaScript entry phải được phục vụ cùng địa chỉ web local.')
      const { response: assetResponse, text: script, bytes: scriptBytes } = await request(asset.href, 'GET', 10_000, 'text/javascript')
      if (!assetResponse.ok || !/(?:java|ecma)script/i.test(assetResponse.headers.get('content-type') ?? '') || !script.trim() || /^\s*</.test(script)) {
        throw new Error(`${asset.href}: JavaScript entry không hợp lệ (HTTP ${assetResponse.status}); kiểm tra build và static assets.`)
      }
      if (build && digest(scriptBytes) !== build.entries.get(src)) {
        throw new Error(`${asset.href}: nội dung JavaScript khác build cục bộ; kiểm tra đúng preview và build lại.`)
      }
    }
    console.log(`Web: kết nối được tại ${web} · ${build ? `HTML + ${servedScripts.length} JavaScript entry trùng bytes với dist` : 'chưa có build hợp lệ để đối chiếu bytes'}`)
  }),
  check('Web → API', async () => {
    const system = validateSystem(await requestJson(`${web}/api/system/status`))
    if (!system.inference.reachable) throw new Error(system.inference.error || 'API qua địa chỉ web chưa kết nối được inference.')
    console.log(`Web → API: kết nối được qua ${web}/api/system/status`)
  }),
  check('API', async () => {
    const system = validateSystem(await requestJson(`${api}/api/system/status`))
    console.log(`API: kết nối được tại ${api}`)
    if (!system.inference.reachable) fail('API → inference', new Error(system.inference.error || 'API chưa kết nối được dịch vụ suy luận.'))
    else console.log('API → inference: kết nối được')
  }),
  check('Inference', async () => {
    const health = validateHealth(await requestJson(`${inference}/v1/health`))
    console.log(`Inference: kết nối được trực tiếp tại ${inference}`)
    return health
  }),
  check('Đọc danh sách', async () => {
    const began = performance.now()
    const calls = await requestJson(`${api}/api/calls?pageSize=5`)
    if (!Array.isArray(calls?.items) || typeof calls.total !== 'number') throw new Error('Danh sách cuộc gọi có cấu trúc không hợp lệ.')
    console.log(`Đọc danh sách: ${(performance.now() - began).toFixed(1)} ms · ${calls.total} cuộc gọi trong DB.`)
  }),
])

let health = results[3]
if (health) {
  if (warmup) {
    const asr = health.components?.asr
    if (!asr || asr.mock || !['faster_whisper', 'faster-whisper'].includes(asr.adapter)) {
      console.log('Nạp ASR: bỏ qua; chỉ hỗ trợ faster-whisper thật từ cache cục bộ.')
    } else {
      const warmed = await check('Nạp ASR', async () => {
        console.log('Đang nạp ASR trong dịch vụ đang chạy. Không tải weights mới…')
        const began = performance.now()
        const ready = validateHealth(await requestJson(`${inference}/v1/warmup`, 'POST', 120_000))
        console.log(`Nạp model: ${(performance.now() - began).toFixed(0)} ms. Vẫn cần chạy một file ngắn để đo cả suy luận.`)
        return ready
      })
      if (warmed) health = warmed
    }
  }
  for (const name of ['asr', 'diarization', 'ser']) {
    const c = health.components[name]
    const mode = c.adapter === 'none' ? 'chưa có model gán vai người nói' : c.mock ? 'MOCK / mô phỏng' : 'thành phần thật'
    console.log(`${name.toUpperCase()}: ${mode} · ${c.adapter} · ready=${c.ready}${c.loaded === undefined ? '' : ` · loaded=${c.loaded}`}${c.verified === undefined ? '' : ` · verified=${c.verified}`}`)
    console.log(`  ${c.detail}`)
    if (!c.ready) failed = true
  }
  console.log(`FFmpeg: ${health.ffmpeg ? 'sẵn sàng' : 'chưa sẵn sàng'}`)
  if (!health.ffmpeg || health.status !== 'ok') failed = true
  if (requireRealSer && (health.components.ser.mock || !health.components.ser.ready || health.components.ser.verified !== true)) {
    console.error('Chưa đạt điều kiện trình bày SER thật đã kiểm chứng.')
    realSerFailed = true
  }
}
console.log('Thời gian đọc API không phải tốc độ ASR/SER. HTTP HTML/assets không kiểm tra thao tác trình duyệt hoặc độ chính xác mô hình.')
console.log('Sau bước này: phát audio, seek một câu, lưu đánh giá, tải lại, thử export. Xem docs/DEMO_RUNBOOK.md.')
process.exitCode = realSerFailed ? 2 : failed ? 1 : 0
