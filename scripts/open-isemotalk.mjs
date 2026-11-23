// Windows: ONE double-click entrypoint for a genuine ISEmoTalk QA workspace.
// Uses an SSH tunnel; runs API + Python together on FTISU in isolated ports.
// No mock inference, no overwriting the original dataset/DB, no user CMD chain.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') throw Error('Use ISEmoTalk.cmd on Windows only.')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logs = join(root, '.isemotalk-launcher')
mkdirSync(logs, {recursive: true})
const apiPort = 13002 // Windows loopback tunnel
const webPort = 5174 // separate from legacy 5173 preview
const base = 'http://127.0.0.1:' + apiPort
const url = 'http://127.0.0.1:' + webPort
const owned = []
const log = (message) => console.log('[ISEmoTalk] ' + message)
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))
const logFile = name => join(logs, name + '.log')
function showLastLines(name) {
  const file = logFile(name)
  if (existsSync(file)) console.error(readFileSync(file, 'utf8').split(/\r?\n/).slice(-18).join('\n'))
}
function start(name, command, args, options = {}) {
  const fd = openSync(logFile(name), 'a')
  const child = spawn(command, args, {
    cwd: root, env: options.env || process.env,
    windowsHide: true, shell: false, stdio: ['ignore', fd, fd],
  })
  child.on('error', e => log(name + ': ' + e.message))
  owned.push(child)
  return child
}
function run(command, args) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, {cwd: root, env: process.env, stdio: 'inherit', shell: false})
    child.on('error', fail)
    child.on('exit', code => code === 0 ? ok() : fail(Error(command + ' failed (' + code + ')')))
  })
}
async function health() {
  try {
    const response = await fetch(base + '/api/system/status', {signal: AbortSignal.timeout(3000)})
    if (!response.ok) return null
    return await response.json()
  } catch { return null }
}
function valid(h) {
  const c = h?.inference?.components
  return h?.api === 'ok' && h.previewOnly !== true && h.inference?.reachable &&
    h.inference?.qa?.ready === true && c?.ser?.adapter === 'not_configured' &&
    c.ser.mock === false && c.ser.ready === false &&
    c?.asr?.mock === false && (c.asr.ready || c.asr.adapter === 'not_configured')
}
async function webAlive() {
  try {
    const response = await fetch(url + '/', {signal: AbortSignal.timeout(1800)})
    return response.ok
  } catch { return false }
}

async function main() {
  log('Khởi động web, API và mô hình thật bằng một thao tác. Không dùng dữ liệu giả.')
  if (!existsSync(join(root, 'package.json'))) throw Error('Thiếu thư mục source ISEmoTalk.')
  if (!existsSync(join(root, 'node_modules', 'vite', 'bin', 'vite.js'))) {
    log('Cài các phụ thuộc giao diện lần đầu...')
    await run('cmd.exe', ['/d', '/s', '/c', 'npm ci --no-audit --no-fund'])
  }
  log('Cập nhật bản giao diện đang mở...')
  await run('cmd.exe', ['/d', '/s', '/c', 'npm run build'])

  const tunnel = start('tunnel', 'ssh', [
    '-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-L', '127.0.0.1:' + apiPort + ':127.0.0.1:3102', 'ftisu-ser',
  ])
  let live = null
  for (let i = 0; i < 5; i++) {
    live = await health()
    if (live) break
    if (tunnel.exitCode !== null) break
    await delay(900)
  }
  if (tunnel.exitCode !== null) {
    showLastLines('tunnel')
    throw Error('SSH ftisu-ser không kết nối được. Cần kiểm tra alias SSH/quyền truy cập trên máy này.')
  }
  if (live && !valid(live)) {
    throw Error('Port riêng 3102 đang phục vụ ứng dụng khác hoặc model chưa sẵn sàng. Không tự dừng dịch vụ của người khác.')
  }

  if (!live) {
    log('Mở Python + Express ở FTISU (không đụng bản preview cũ)...')
    const remote = "cd ~/services/isemotalk && git fetch origin && git switch feat/remote-gpu-full-pipeline-20261123 && git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123 && . ~/.local/share/isemotalk-node-env.sh && PORT=3102 ISEMO_INFERENCE_PORT=8102 npm run remote:qa-auto"
    const shellCommand = "bash -lc '" + remote.replaceAll("'", "'\\''") + "'"
    const worker = start('gpu', 'ssh', [
      '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=30',
      'ftisu-ser', shellCommand,
    ])
    for (let i = 0; i < 45; i++) {
      live = await health()
      if (valid(live)) break
      if (worker.exitCode !== null) break
      await delay(2000)
    }
    if (!valid(live)) {
      showLastLines('gpu')
      throw Error('GPU QA chưa khởi động thành công. Ghi rõ lỗi trong .isemotalk-launcher/gpu.log; không giả vờ model chạy.')
    }
  }
  log('XLM-R QA thật đã kết nối. ASR: ' +
    (live.inference.components.asr.ready ? 'PhoWhisper thật' : 'chưa có checkpoint cached; dùng transcript nguồn') +
    '. SER: chưa xác minh, không dùng nhãn giả.')
  const web = start('web', process.execPath, ['scripts/start-remote-web.mjs', '--qa'], {
    env: {...process.env, ISEMO_REMOTE_API_PORT: String(apiPort), ISEMO_WEB_PORT: String(webPort)},
  })
  for (let i = 0; i < 25; i++) {
    if (await webAlive()) break
    if (web.exitCode !== null) break
    await delay(600)
  }
  if (!(await webAlive())) {
    showLastLines('web')
    throw Error('Frontend không mở được ở ' + url + '.')
  }
  spawn('explorer.exe', [url], {detached: true, stdio: 'ignore'}).unref()
  log('Đã mở ' + url + ' — chỉ cần dùng web: Cuộc gọi → xem AI QA → nghe → đánh giá → tạo vụ việc.')
  log('Không cần nhập thêm CMD. Giữ cửa sổ này mở trong lúc sử dụng.')
  // Keep the owning launcher alive for diagnostic visibility. Closing this
  // window stops the local session; remote services are only on loopback.
  await new Promise(() => {})
}

main().catch(error => {
  console.error('\n[ISEmoTalk] Không mở được phiên làm việc:', error.message)
  console.error('[ISEmoTalk] Không chuyển sang demo/mô phỏng khi model thật lỗi.')
  process.exitCode = 1
})
