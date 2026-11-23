import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLoopbackPortsAvailable, checkDemoPrerequisites, startDemoServices } from './demo-runtime.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

try {
  const settings = checkDemoPrerequisites(projectRoot)
  await assertLoopbackPortsAvailable([5173, 3001, 8001])
  console.log(`[demo] Node ${process.versions.node}; Python: ${settings.python}`)
  console.log(`[demo] Dữ liệu: ${settings.dataDir}`)
  console.log(`[demo] Audio chung cho API và inference: ${settings.uploadsDir}`)
  console.log('[demo] Đang khởi động 3 dịch vụ. Giữ terminal này mở; Ctrl+C để dừng cả nhóm.')
  console.log('[demo] Web: http://127.0.0.1:5173 | API: 3001 | Inference: 8001')
  console.log('[demo] Sau các thông báo startup, mở terminal khác chạy: npm run demo:warmup')

  let stopSignal
  const markStop = signal => { stopSignal = signal }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, markStop)
  try {
    const run = startDemoServices(projectRoot, settings.childEnv)
    for (const command of run.commands) console.log(`[demo] ${command.name}: supervisor child PID=${command.pid ?? 'pending'}`)
    const events = await run.result.catch(error => {
      if (!Array.isArray(error)) throw error
      return error
    })
    if (stopSignal) {
      console.log(`[demo] Đã nhận ${stopSignal}; nhóm dịch vụ đã dừng.`)
      process.exitCode = stopSignal === 'SIGINT' ? 0 : 1
    } else {
      const first = [...events].sort((a, b) => a.timings.endDate - b.timings.endDate)[0]
      console.error(`[demo] Dịch vụ ${first?.command.name ?? 'không xác định'} đã thoát (code/signal=${first?.exitCode ?? 'unknown'}). Các dịch vụ còn lại đã được dừng.`)
      console.error('[demo] Web chỉ dùng được khi nhóm dịch vụ đang chạy. Gửi log phía trên và mã thoát nếu lệnh tự kết thúc.')
      process.exitCode = 1
    }
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, markStop)
  }
} catch (error) {
  console.error(`[demo] ${error.message}`)
  process.exitCode = 1
}
