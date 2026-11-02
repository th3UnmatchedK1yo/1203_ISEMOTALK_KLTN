import { loadConfig } from './config'
import { openDb } from './db'
import { seedDemo } from './seed'

const reset = process.argv.includes('--reset')
const config = loadConfig()
const db = openDb(config.dbFile)
const { created } = seedDemo(db, config, { reset })
console.log(created ? `Đã tạo ${created} cuộc gọi mô phỏng (provenance = mock).` : 'Đã có dữ liệu mô phỏng. Dùng --reset để tạo lại.')
db.close()
