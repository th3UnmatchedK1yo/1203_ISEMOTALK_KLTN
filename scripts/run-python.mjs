import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inferenceDir = path.join(projectRoot, 'inference')
const python = process.env.ISEMO_PYTHON || path.join(inferenceDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python)) {
  console.error(`Chưa tìm thấy Python cho inference: ${python}`)
  console.error('Tạo inference/.venv và cài requirements-core.txt theo docs/DEMO_RUNBOOK.md. Có thể đặt ISEMO_PYTHON thành đường dẫn Python tuyệt đối đã chuẩn bị.')
  process.exit(1)
}
const child = spawn(python, process.argv.slice(2), { cwd: inferenceDir, stdio: 'inherit', shell: false })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
