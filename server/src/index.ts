import fs from 'node:fs'
import { createApp } from './app'
import { loadConfig } from './config'
import { openDb } from './db'
import { HttpInferenceClient } from './inference/client'
import { Pipeline } from './pipeline'
import { seedDemo } from './seed'
import { AutoQa } from './auto-qa'

const config = loadConfig()
fs.mkdirSync(config.uploadsDir, { recursive: true })
const db = openDb(config.dbFile)

// Auto-initialize a brand new LOCAL dev database with explicitly labeled mock data.
// Never overwrite, delete or duplicate existing records or their human reviews.
if (process.env.NODE_ENV !== 'production' && process.env.ISEMO_AUTO_SEED !== '0') {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM calls').get() as { n: number }).n
  if (count === 0) {
    const result = seedDemo(db, config)
    console.log('[api] Empty development DB: created ' + result.created + ' synthetic demo calls (provenance=mock).')
  }
}
const client = new HttpInferenceClient(config.inferenceUrl)
// Automatic genuine QA runs only in an explicitly configured real deployment.
// Preview and mock environments never create model predictions.
const qaAutomationEnabled = process.env.ISEMO_API_PREVIEW_ONLY !== '1' &&
  process.env.ISEMO_QA_AUTOMATION === '1' && !!process.env.ISEMO_QA_MODEL_DIR
const autoQa = qaAutomationEnabled
  ? new AutoQa(db, config, (m, e) => console.error('[auto-qa]', m, e ?? ''))
  : null
const pipeline = new Pipeline(db, config, client,
  (m, e) => console.error(`[pipeline] ${m}`, e ?? ''),
  id => autoQa?.onCallReady(id))
if (process.env.ISEMO_API_PREVIEW_ONLY !== '1') {
  pipeline.resume()
  autoQa?.start()
} else console.warn('[api] PREVIEW ONLY: queued calls will NOT resume until real inference is running.')

const app = createApp({ db, config, client, pipeline, autoQa })
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${config.port}  db=${config.dbFile}  inference=${config.inferenceUrl}`)
})

let shuttingDown = false
const shutdown = () => {
  if (shuttingDown) return
  shuttingDown = true
  const drain = pipeline.stop()
  const closed = new Promise<void>((resolve) => server.close(() => resolve()))
  const forceClose = setTimeout(() => server.closeAllConnections(), 10_000)
  forceClose.unref()
  void Promise.all([drain, closed, autoQa?.stop()]).then(() => {
    clearTimeout(forceClose)
    db.close()
    process.exit(0)
  }).catch((e) => {
    console.error('[api] Shutdown failed', e)
    process.exit(1)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
