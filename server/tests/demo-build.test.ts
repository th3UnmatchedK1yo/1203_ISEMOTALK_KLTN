import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { assertLocalDemoApiTarget } from '../../scripts/demo-build.mjs'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

it('records the API origin actually embedded in a build and rejects it for the local demo', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'isemo-browser-api-'))
  const target = 'http://127.0.0.1:43987'
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(process.execPath, [path.join(repository, 'node_modules/vite/bin/vite.js'), 'build', '--config', path.join(repository, 'vite.config.ts'), '--outDir', path.join(fixture, 'dist'), '--emptyOutDir', '--logLevel', 'error'], {
        cwd: repository,
        env: { ...process.env, VITE_API_BASE_URL: target + '/', NODE_ENV: 'production' },
        timeout: 12_000,
      }, error => error ? reject(error) : resolve())
    })
    const manifest = JSON.parse(await readFile(path.join(fixture, 'dist/demo-build.json'), 'utf8'))
    expect(manifest).toEqual({ version: 1, apiBaseUrl: target })
    const html = await readFile(path.join(fixture, 'dist/index.html'), 'utf8')
    const entry = html.match(/<script[^>]+src="([^"]+)"/)?.[1]
    expect(entry).toBeDefined()
    const script = await readFile(path.join(fixture, 'dist', entry!), 'utf8')
    expect(script).toContain(target)
    expect(() => assertLocalDemoApiTarget(fixture)).toThrow(/VITE_API_BASE_URL/)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
