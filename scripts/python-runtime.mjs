import { accessSync, constants, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Select the prepared interpreter without activating or changing its environment.
 * Keep the venv path itself: resolving a Python symlink can bypass its venv.
 * @param {string} projectRoot
 * @param {Record<string, string | undefined>} [env]
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
export function resolvePythonExecutable(projectRoot, env = process.env, platform = process.platform) {
  const override = env.ISEMO_PYTHON
  if (override && !path.isAbsolute(override)) {
    throw new Error(`ISEMO_PYTHON phải là đường dẫn tuyệt đối tới Python executable; nhận được: ${override}`)
  }
  const python = override || path.resolve(projectRoot, 'inference', '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  try {
    if (!statSync(python).isFile()) throw new Error('not a file')
    accessSync(python, constants.X_OK)
  } catch {
    throw new Error(`Chưa tìm thấy Python có thể chạy: ${python}\nGiữ môi trường đang hoạt động; nếu chưa có, tạo inference/.venv và cài requirements-core.txt theo docs/DEMO_RUNBOOK.md. Có thể đặt ISEMO_PYTHON thành đường dẫn tuyệt đối tới Python đã chuẩn bị.`)
  }
  return python
}
