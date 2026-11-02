import fs from 'node:fs'
import { createApp } from './app'
import { loadConfig } from './config'
import { openDb } from './db'
import { HttpInferenceClient } from './inference/client'
import { Pipeline } from './pipeline'

const config = loadConfig()
fs.mkdirSync(config.uploadsDir, { recursive: true })
const db = openDb(config.dbFile)
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
