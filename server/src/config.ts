import path from 'node:path'

export interface Config {
  port: number
  dataDir: string
  uploadsDir: string
  dbFile: string
  inferenceUrl: string
  maxUploadBytes: number
  minDurationSec: number
  maxDurationSec: number
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? path.resolve(process.env.ISEMO_DATA_DIR ?? 'server/data')
  return {
    port: Number(process.env.PORT ?? 3001),
    dataDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    dbFile: path.join(dataDir, 'isemotalk.db'),
    inferenceUrl: process.env.INFERENCE_URL ?? 'http://127.0.0.1:8001',
    maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 300) * 1024 * 1024,
    minDurationSec: 1,
    maxDurationSec: 3 * 60 * 60,
    ...overrides,
  }
}
