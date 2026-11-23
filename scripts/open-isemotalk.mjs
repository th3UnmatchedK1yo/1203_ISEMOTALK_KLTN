// Windows: ONE double-click entrypoint for a genuine ISEmoTalk QA workspace.
// Uses an SSH tunnel; runs API + Python together on FTISU in isolated ports.
// No mock inference, no overwriting the original dataset/DB, no user CMD chain.
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { sshRuntimeArgs } from './oneclick-ssh.mjs'
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
let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  for (const child of owned.reverse()) {
    if (child.exitCode === null && child.pid) {
      try { child.kill() } catch { /* process already gone */ }
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cleanup()
  process.exit(0)
})
const log = (message) => console.log('[ISEmoTalk] ' + message)
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))
const logFile = name => join(logs, name + '.log')
function showLastLines(name) {
  const file = logFile(name)
  if (existsSync(file)) console.error(readFileSync(file, 'utf8').split(/\r?\n/).slice(-18).join('\n'))
}
function start(name, command, args, options = {}) {
  // SSH MUST inherit the interactive Windows terminal to request a password
  // when this user's remote VS Code connection is not backed by a loaded key.
  // Never echo, collect, persist or forward passwords through JavaScript.
  const fd = options.interactive ? null : openSync(logFile(name), 'a')
  const child = spawn(command, args, {
    cwd: root, env: options.env || process.env,
    windowsHide: !options.interactive, shell: false,
    stdio: options.interactive ? 'inherit' : ['ignore', fd, fd],
  })
  if (fd !== null) closeSync(fd)
  child.on('error', e => { child.launchError = e.message; log(name + ': ' + e.message) })
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
    h.inference?.qa?.ready === true && h.inference.qa.loaded === true && c?.ser?.adapter === 'not_configured' &&
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
  // One SSH authentication instead of two non-interactive sessions.
  // A key from ssh-agent works without prompting; otherwise Windows OpenSSH
  // can ask for the user's normal FTISU account password in THIS console.
  let live = await health()
  if (live && !valid(live)) {
    throw Error('Cổng 13002 đang có API không khớp với phiên QA thật. Không tự dừng tiến trình khác.')
  }
  if (!valid(live)) {
    log('Kết nối FTISU qua SSH. Nếu hệ thống hỏi mật khẩu, nhập mật khẩu FTISU rồi nhấn Enter.')
    log('Ký tự mật khẩu có thể không hiển thị trong console. Không nhập mật khẩu vào chat.')
    const sshProcess = start('ssh+gpu', 'ssh', sshRuntimeArgs(), {interactive: true})
    for (let i = 0; i < 360; i++) {
      live = await health()
      if (valid(live)) break
      if (sshProcess.exitCode !== null || sshProcess.launchError) break
      await delay(1000)
    }
    if (!valid(live)) {
      if (sshProcess.exitCode !== null || sshProcess.launchError) {
        throw Error('Phiên SSH/AI trên FTISU đã dừng trước khi backend sẵn sàng. Xem lỗi ngay phía trên: ' +
          'nếu có Python Traceback/AttributeError là lỗi inference, KHÔNG PHẢI sai mật khẩu SSH. ' +
          'Chỉ khi thấy Permission denied (publickey,password) mới kiểm tra xác thực SSH.')
      }
      throw Error('Đã kết nối SSH nhưng QA GPU chưa báo sẵn sàng. Xem lỗi mô hình trong console; ' +
        'không tự chuyển sang mô phỏng.')
    }
  } else {
    log('Đang sử dụng phiên API GPU thật đã có tại 127.0.0.1:' + apiPort + '.')
  }
  log('Kết nối API/Python thành công. Đang build giao diện hiện tại...')
  await run('cmd.exe', ['/d', '/s', '/c', 'npm run build'])

  log('XLM-R QA thật đã kết nối. ASR: ' +
    (live.inference.components.asr.ready ? 'PhoWhisper thật' : 'chưa có checkpoint cached; dùng transcript nguồn') +
    '. SER: chưa xác minh, không dùng nhãn giả.')
  if (await webAlive()) {
    log('Giao diện đã mở sẵn; sử dụng phiên web đang hoạt động.')
    spawn('explorer.exe', [url], {detached:true,stdio:'ignore'}).unref()
    await new Promise(() => {})
  }
  const web = start('web', process.execPath, ['scripts/start-remote-web.mjs', '--qa'], {
    env: {...process.env, ISEMO_REMOTE_API_PORT: String(apiPort), ISEMO_WEB_PORT: String(webPort)},
  })
  for (let i = 0; i < 25; i++) {
    if (await webAlive()) break
    if (web.exitCode !== null || web.launchError) break
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
  console.error('[ISEmoTalk] Nếu SSH cần mật khẩu, launcher sẽ chỉ hỏi trong cửa sổ Windows; không gửi mật khẩu cho bất kỳ ai.')
  cleanup()
  process.exitCode = 1
})
