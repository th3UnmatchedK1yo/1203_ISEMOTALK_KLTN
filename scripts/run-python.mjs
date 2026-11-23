import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePythonExecutable } from './python-runtime.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inferenceDir = path.join(projectRoot, 'inference')
let python
try {
  python = resolvePythonExecutable(projectRoot)
} catch (error) {
  console.error(`[python] ${error.message}`)
  process.exit(1)
}
console.log(`[python] executable=${python}`)
const child = spawn(python, process.argv.slice(2), { cwd: inferenceDir, stdio: 'inherit', shell: false })
child.on('spawn', () => console.log(`[python] PID=${child.pid} · cwd=${inferenceDir}`))
child.on('error', error => {
  console.error(`[python] Không khởi động được ${python}: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  console.log(`[python] PID=${child.pid} đã dừng · code=${code ?? 'null'} · signal=${signal ?? 'none'}`)
  process.exitCode = code ?? (signal ? 1 : 0)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  console.log(`[python] Nhận ${signal}; chuyển yêu cầu dừng tới PID=${child.pid ?? 'chưa có'}.`)
  if (child.exitCode === null && child.signalCode === null) child.kill(signal)
})
