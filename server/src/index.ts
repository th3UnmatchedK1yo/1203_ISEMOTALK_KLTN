import fs from 'node:fs'
import { createApp } from './app'
import { loadConfig } from './config'
import { openDb } from './db'
import { HttpInferenceClient } from './inference/client'
import { Pipeline } from './pipeline'
import { seedDemo } from './seed'

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
const pipeline = new Pipeline(db, config, client, (m, e) => console.error(`[pipeline] ${m}`, e ?? ''))
pipeline.resume()

const app = createApp({ db, config, client, pipeline })
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${config.port}  db=${config.dbFile}  inference=${config.inferenceUrl}`)
})

const shutdown = () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
