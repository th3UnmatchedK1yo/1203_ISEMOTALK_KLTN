import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('GPU remote deployment safety', () => {
  it('never passes remote GPU preflight when ASR/SER are mocked', () => {
    const result = spawnSync(process.execPath, ['scripts/check-remote-server.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: {
        ...process.env,
        ISEMO_ASR: 'mock',
        ISEMO_SER: 'mock',
        ISEMO_SER_FACTORY: '',
        ISEMO_SER_CONFIG: '',
      },
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ASR is not configured as a real model')
    expect(result.stderr).toContain('SER must be checkpoint')
  })

  it('remote server startup refuses Windows even if scripts are present', () => {
    if (process.platform !== 'win32') return
    const result = spawnSync(process.execPath, ['scripts/start-remote-server.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 10000,
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Linux GPU server')
  })
})
