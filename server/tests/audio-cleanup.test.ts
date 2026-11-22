import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { makeApp } from './helpers'

let t: ReturnType<typeof makeApp>
beforeEach(() => { t = makeApp() })
afterEach(() => { vi.restoreAllMocks(); t.cleanup() })

async function upload() {
  const response = await t.api.post('/api/calls/upload').attach('audio', Buffer.from('RIFF....WAVEfmt '), 'call.wav')
  expect(response.status).toBe(202)
  await t.pipeline.onIdle()
  return response.body.id as string
}

function count(table: string, callId: string) {
  return (t.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE call_id=?`).get(callId) as { n: number }).n
}

describe('recording deletion and its durable cleanup job', () => {
  it('deletes the call, its dependent rows and its owned recording directory', async () => {
    const id = await upload()
    expect((await t.api.put(`/api/calls/${id}/workflow`).send({ baseVersion: 0, reviewerName: 'QA', reason: 'Check recording' })).status).toBe(200)
    t.db.prepare('INSERT INTO moment_reviews(call_id, moment_id, note) VALUES (?,?,?)').run(id, 'legacy-moment', 'Evidence')
    expect(count('utterances', id)).toBeGreaterThan(0)
    expect(count('workflow_events', id)).toBe(1)

    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(204)

    expect(t.db.prepare('SELECT id FROM calls WHERE id=?').get(id)).toBeUndefined()
    for (const table of ['utterances', 'moment_reviews', 'call_workflows', 'workflow_events', 'audio_cleanup_jobs']) {
      expect(count(table, id)).toBe(0)
    }
    expect(fs.existsSync(path.join(t.config.uploadsDir, id))).toBe(false)
  })

  it.each(['../sibling/audio.wav', 'audio.wav'])('rejects unsafe legacy audio path %s without deleting any records or files', async (audioFile) => {
    const id = await upload()
    const outside = path.join(t.config.dataDir, 'sibling')
    fs.mkdirSync(outside)
    fs.writeFileSync(path.join(outside, 'audio.wav'), 'keep outside')
    t.db.prepare('UPDATE calls SET audio_file=? WHERE id=?').run(audioFile, id)

    const response = await t.api.delete(`/api/calls/${id}`)

    expect(response.status).toBe(409)
    expect(response.body.code).toBe('unsafe_audio_path')
    expect(t.db.prepare('SELECT id FROM calls WHERE id=?').get(id)).toBeDefined()
    expect(count('utterances', id)).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(outside, 'audio.wav'), 'utf8')).toBe('keep outside')
    expect(fs.existsSync(path.join(t.config.uploadsDir, id, 'audio.wav'))).toBe(true)
  })

  it('never deletes another call directory referenced by an invalid legacy row', async () => {
    const id = await upload()
    const other = await upload()
    t.db.prepare('UPDATE calls SET audio_file=? WHERE id=?').run(path.join(other, 'audio.wav'), id)

    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(409)
    expect((await t.api.get(`/api/calls/${id}`)).status).toBe(200)
    expect(fs.existsSync(path.join(t.config.uploadsDir, other, 'audio.wav'))).toBe(true)
  })

  it('rejects a call directory that was replaced with an external junction or symlink', async () => {
    const id = await upload()
    const owned = path.join(t.config.uploadsDir, id)
    const outside = path.join(t.config.dataDir, 'outside')
    fs.mkdirSync(outside)
    fs.writeFileSync(path.join(outside, 'audio.wav'), 'keep target')
    fs.rmSync(owned, { recursive: true })
    fs.symlinkSync(outside, owned, 'junction')

    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(409)
    expect(t.db.prepare('SELECT id FROM calls WHERE id=?').get(id)).toBeDefined()
    expect(fs.readFileSync(path.join(outside, 'audio.wav'), 'utf8')).toBe('keep target')
  })

  it('rejects an audio reference escaping through a nested directory link', async () => {
    const id = await upload()
    const outside = path.join(t.config.dataDir, 'outside')
    fs.mkdirSync(outside)
    fs.writeFileSync(path.join(outside, 'audio.wav'), 'keep target')
    fs.symlinkSync(outside, path.join(t.config.uploadsDir, id, 'linked'), 'junction')
    t.db.prepare('UPDATE calls SET audio_file=? WHERE id=?').run(path.join(id, 'linked', 'audio.wav'), id)

    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(409)
    expect(fs.readFileSync(path.join(outside, 'audio.wav'), 'utf8')).toBe('keep target')
    expect(count('utterances', id)).toBeGreaterThan(0)
  })

  it('commits logical deletion and retains a retryable job when Windows denies file removal', async () => {
    const id = await upload()
    const owned = path.join(t.config.uploadsDir, id)
    const remove = fs.rmSync.bind(fs)
    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (target === owned) throw Object.assign(new Error('Recording is still open'), { code: 'EACCES' })
      return remove(target, options)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(204)
    expect(t.db.prepare('SELECT id FROM calls WHERE id=?').get(id)).toBeUndefined()
    expect(t.db.prepare('SELECT attempts, last_error FROM audio_cleanup_jobs WHERE call_id=?').get(id)).toMatchObject({ attempts: 1 })
    expect((t.db.prepare('SELECT last_error FROM audio_cleanup_jobs WHERE call_id=?').get(id) as { last_error: string }).last_error).toContain('EACCES')
    expect(fs.existsSync(path.join(owned, 'audio.wav'))).toBe(true)

    vi.restoreAllMocks()
    createApp({ db: t.db, config: t.config, client: t.client, pipeline: t.pipeline })
    expect(count('audio_cleanup_jobs', id)).toBe(0)
    expect(fs.existsSync(owned)).toBe(false)
  })

  it('recovers a cleanup job left by a crash after the delete transaction committed', async () => {
    const id = await upload()
    t.db.transaction(() => {
      t.db.prepare('DELETE FROM calls WHERE id=?').run(id)
      t.db.prepare('INSERT INTO audio_cleanup_jobs(call_id, created_at) VALUES (?,?)').run(id, new Date().toISOString())
    })()
    expect(fs.existsSync(path.join(t.config.uploadsDir, id, 'audio.wav'))).toBe(true)

    createApp({ db: t.db, config: t.config, client: t.client, pipeline: t.pipeline })

    expect(count('audio_cleanup_jobs', id)).toBe(0)
    expect(fs.existsSync(path.join(t.config.uploadsDir, id))).toBe(false)
  })

  it('rolls back the call deletion if a durable cleanup job cannot be recorded', async () => {
    const id = await upload()
    t.db.exec(`CREATE TRIGGER reject_cleanup BEFORE INSERT ON audio_cleanup_jobs BEGIN SELECT RAISE(ABORT, 'injected queue write failure'); END`)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(500)
    expect((await t.api.get(`/api/calls/${id}`)).status).toBe(200)
    expect(count('utterances', id)).toBeGreaterThan(0)
    expect(count('audio_cleanup_jobs', id)).toBe(0)
    expect(fs.existsSync(path.join(t.config.uploadsDir, id, 'audio.wav'))).toBe(true)
  })

  it('finishes cleanup idempotently when the recording directory is already missing', async () => {
    const id = await upload()
    fs.rmSync(path.join(t.config.uploadsDir, id), { recursive: true })

    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(204)
    expect(t.db.prepare('SELECT id FROM calls WHERE id=?').get(id)).toBeUndefined()
    expect(count('audio_cleanup_jobs', id)).toBe(0)
  })
})
