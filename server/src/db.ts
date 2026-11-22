import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { migrateDatabase } from './db-schema'

export type DB = Database.Database

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  try {
    db.pragma('busy_timeout = 5000')
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = FULL')
    migrateDatabase(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
