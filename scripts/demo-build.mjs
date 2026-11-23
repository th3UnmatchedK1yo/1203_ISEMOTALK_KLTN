import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Check the browser's build-time API configuration, not the current shell's env. */
export function assertLocalDemoApiTarget(projectRoot) {
  let manifest
  try { manifest = JSON.parse(readFileSync(path.join(projectRoot, 'dist/demo-build.json'), 'utf8')) } catch {
    throw new Error('Thiếu thông tin API của bản build. Chạy npm run build rồi thử lại.')
  }
  if (manifest?.version !== 1 || typeof manifest.apiBaseUrl !== 'string') {
    throw new Error('Thông tin API của bản build không hợp lệ. Chạy npm run build rồi thử lại.')
  }
  if (manifest.apiBaseUrl !== '') {
    throw new Error('API trong build này khác same-origin (VITE_API_BASE_URL hoặc NODE_ENV=development). Để chạy demo local, dùng môi trường build production, bỏ override API trong môi trường build/.env rồi chạy npm run build; cấu hình triển khai riêng vẫn có thể chạy từng dịch vụ.')
  }
}
