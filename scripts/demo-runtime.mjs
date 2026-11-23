import { readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import concurrently from 'concurrently'
import { resolvePythonExecutable } from './python-runtime.mjs'
import { assertLocalDemoApiTarget } from './demo-build.mjs'

/** Validate the co-located, fixed-port demo without changing files or model settings. */
export function checkDemoPrerequisites(projectRoot, env = process.env) {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error(`Demo cần Node.js 22 trở lên; hiện tại: ${process.versions.node}.`)
  }
  let built = false
  try { built = statSync(path.join(projectRoot, 'dist/index.html')).isFile() } catch { /* absent build */ }
  if (!built) throw new Error('Chưa có dist/index.html. Chạy npm run build rồi chạy lại npm run demo.')
  assertLocalDemoApiTarget(projectRoot)

  const python = resolvePythonExecutable(projectRoot, env)
  if (env.PORT !== undefined && Number(env.PORT) !== 3001) {
    throw new Error('npm run demo dùng API port 3001 vì frontend proxy tới port này. Bỏ PORT tùy chỉnh hoặc chạy từng dịch vụ theo cấu hình riêng.')
  }
  if (env.INFERENCE_URL !== undefined) {
    let url
    try { url = new URL(env.INFERENCE_URL) } catch { /* invalid URL */ }
    if (!url || url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || url.port !== '8001' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error('npm run demo cần INFERENCE_URL=http://127.0.0.1:8001 trên cùng máy. Worker từ xa cần hợp đồng truyền audio riêng; đổi URL không chuyển file.')
    }
  }

  const dataDir = path.resolve(projectRoot, env.ISEMO_DATA_DIR || 'server/data')
  const uploadsDir = path.join(dataDir, 'uploads')
  if (env.ISEMO_UPLOADS_DIR) {
    const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value
    if (!path.isAbsolute(env.ISEMO_UPLOADS_DIR)
      || normalize(path.resolve(env.ISEMO_UPLOADS_DIR)) !== normalize(uploadsDir)) {
      throw new Error(`ISEMO_UPLOADS_DIR phải trùng thư mục audio của API: ${uploadsDir}. Đặt ISEMO_DATA_DIR để chuyển cả dữ liệu ứng dụng.`)
    }
  }
  return {
    python, dataDir, uploadsDir,
    childEnv: {
      ...env,
      ISEMO_PYTHON: python,
      PORT: '3001',
      INFERENCE_URL: 'http://127.0.0.1:8001',
      ISEMO_DATA_DIR: dataDir,
      ISEMO_UPLOADS_DIR: uploadsDir,
      ISEMO_AUTO_SEED: env.ISEMO_AUTO_SEED ?? '0',
    },
  }
}

/** A diagnostic probe only: never kill a port owner or silently choose another port. */
export async function assertLoopbackPortsAvailable(ports) {
  const probes = []
  try {
    for (const port of ports) {
      const server = createServer()
      await new Promise((resolve, reject) => {
        server.once('error', error => reject(new Error(
          `Không mở được 127.0.0.1:${port} (${error.code ?? error.message}). Kiểm tra terminal đang dùng cổng này; demo không tự dừng tiến trình khác.`,
        )))
        server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve)
      })
      probes.push(server)
    }
  } finally {
    await Promise.all(probes.map(server => new Promise(resolve => server.close(resolve))))
  }
}

/** Keep process-tree handling in the existing cross-platform supervisor. */
export function startDemoServices(projectRoot, childEnv) {
  const services = [['inference', 'dev:inference'], ['api', 'start:api'], ['web', 'preview']]
  const windows = process.platform === 'win32'
  const scripts = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).scripts
  const env = windows ? childEnv : {
    ...childEnv,
    PATH: [path.dirname(process.execPath), path.join(projectRoot, 'node_modules/.bin'), childEnv.PATH ?? process.env.PATH ?? ''].join(path.delimiter),
  }
  const commands = services.map(([name, scriptName]) => {
    const script = scripts?.[scriptName]
    if (typeof script !== 'string' || !script.trim()) throw new Error(`Thiếu npm script ${scriptName}.`)
    // On POSIX replace the shell with the foreground service. An intermediate
    // npm/shell can die on TERM while its worker survives, losing the PID needed
    // for the supervisor's later SIGKILL. The Python wrapper stays until its
    // child exits. Windows uses the supported taskkill process-tree backend.
    if (!windows && (!/^(?:node|vite)\s/.test(script) || /[;&|\n\r]/.test(script))) {
      throw new Error(`Demo cần ${scriptName} là một lệnh node/vite foreground; hãy chạy riêng script tùy chỉnh có shell operators.`)
    }
    return { name, command: windows ? `npm:${scriptName}` : `exec ${script}`, env }
  })
  return concurrently(commands, {
    cwd: projectRoot,
    shell: windows ? undefined : '/bin/sh',
    prefix: '[{name}]',
    prefixColors: false,
    killOthersOn: ['success', 'failure'],
    // POSIX fallback exceeds the API's 10s drain window. The Windows tree-kill
    // backend uses taskkill /T /F, so this is not a Windows graceful-stop guarantee.
    killTimeout: 15_000,
    successCondition: 'all',
  })
}
