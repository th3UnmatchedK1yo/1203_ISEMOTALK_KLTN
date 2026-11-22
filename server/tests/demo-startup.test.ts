import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertLoopbackPortsAvailable, checkDemoPrerequisites, startDemoServices } from '../../scripts/demo-runtime.mjs'

const roots: string[] = []
const listeners: Server[] = []
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

afterEach(async () => {
  await Promise.all(listeners.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'isemo demo '))
  roots.push(root)
  await mkdir(path.join(root, 'dist'))
  await writeFile(path.join(root, 'dist/index.html'), '<div id="root"></div>')
  await writeFile(path.join(root, 'dist/demo-build.json'), JSON.stringify({ version: 1, apiBaseUrl: '' }))
  return root
}

async function listen() {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  listeners.push(server)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing loopback port')
  return { server, port: address.port }
}

describe('local demo prerequisites', () => {
  it('requires a build before starting any service', async () => {
    const root = await project()
    await rm(path.join(root, 'dist'), { recursive: true })
    expect(() => checkDemoPrerequisites(root, { ISEMO_PYTHON: process.execPath })).toThrow(/npm run build/)
  })

  it('requires a prepared Python interpreter instead of selecting global Python', async () => {
    const root = await project()
    expect(() => checkDemoPrerequisites(root, {})).toThrow(/Python/)
  })

  it('rejects a build without recorded browser API configuration', async () => {
    const root = await project()
    await rm(path.join(root, 'dist/demo-build.json'))
    expect(() => checkDemoPrerequisites(root, { ISEMO_PYTHON: process.execPath })).toThrow(/npm run build/)
  })

  it('rejects a previously built frontend pointing at another API', async () => {
    const root = await project()
    await writeFile(path.join(root, 'dist/demo-build.json'), JSON.stringify({ version: 1, apiBaseUrl: 'http://127.0.0.1:43987' }))
    expect(() => checkDemoPrerequisites(root, { ISEMO_PYTHON: process.execPath })).toThrow(/VITE_API_BASE_URL/)
  })

  it('resolves a shared uploads directory and preserves model/cache settings', async () => {
    const root = await project()
    const env = { ISEMO_PYTHON: process.execPath, ISEMO_DATA_DIR: 'private data', ISEMO_ASR: 'faster_whisper', HF_HOME: 'cache' }
    const settings = checkDemoPrerequisites(root, env)
    expect(settings.dataDir).toBe(path.join(root, 'private data'))
    expect(settings.uploadsDir).toBe(path.join(root, 'private data/uploads'))
    expect(settings.childEnv.ISEMO_UPLOADS_DIR).toBe(settings.uploadsDir)
    expect(settings.childEnv.ISEMO_DATA_DIR).toBe(settings.dataDir)
    expect(settings.childEnv.ISEMO_AUTO_SEED).toBe('0')
    expect(settings.childEnv.ISEMO_ASR).toBe('faster_whisper')
    expect(settings.childEnv.HF_HOME).toBe('cache')
    expect(env).not.toHaveProperty('ISEMO_UPLOADS_DIR')
  })

  it('honors an explicitly selected auto-seed value', async () => {
    const result = checkDemoPrerequisites(await project(), { ISEMO_PYTHON: process.execPath, ISEMO_AUTO_SEED: '1' })
    expect(result.childEnv.ISEMO_AUTO_SEED).toBe('1')
  })

  it.each(['3002', '0', 'not-a-port'])('rejects API port %s because preview is wired to 3001', async port => {
    const root = await project()
    expect(() => checkDemoPrerequisites(root, { ISEMO_PYTHON: process.execPath, PORT: port })).toThrow(/PORT/)
  })

  it.each(['https://example.test:8001', 'http://127.0.0.1:9000', 'http://127.0.0.1:8001/remote', 'http://user:pass@127.0.0.1:8001'])('rejects incompatible inference endpoint %s', async endpoint => {
    const root = await project()
    expect(() => checkDemoPrerequisites(root, { ISEMO_PYTHON: process.execPath, INFERENCE_URL: endpoint })).toThrow(/INFERENCE_URL/)
  })

  it('accepts the local alias and passes an unambiguous IPv4 endpoint to the API', async () => {
    const result = checkDemoPrerequisites(await project(), { ISEMO_PYTHON: process.execPath, INFERENCE_URL: 'http://localhost:8001/' })
    expect(result.childEnv.INFERENCE_URL).toBe('http://127.0.0.1:8001')
  })

  it('rejects an uploads override that would separate API and inference files', async () => {
    const root = await project()
    expect(() => checkDemoPrerequisites(root, { ISEMO_PYTHON: process.execPath, ISEMO_UPLOADS_DIR: path.join(root, 'other uploads') })).toThrow(/ISEMO_UPLOADS_DIR/)
  })

  it('accepts an explicit matching uploads directory', async () => {
    const root = await project()
    const uploads = path.join(root, 'server/data/uploads')
    expect(checkDemoPrerequisites(root, { ISEMO_PYTHON: process.execPath, ISEMO_UPLOADS_DIR: uploads }).uploadsDir).toBe(uploads)
  })
})

describe('port preflight', () => {
  it('rejects an occupied port without stopping its current owner', async () => {
    const { server, port } = await listen()
    await expect(assertLoopbackPortsAvailable([port])).rejects.toThrow(String(port))
    expect(server.listening).toBe(true)
  })

  it('releases every probe listener on success and on a later failure', async () => {
    const { server, port } = await listen()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await assertLoopbackPortsAvailable([port])
    const occupied = await listen()
    await expect(assertLoopbackPortsAvailable([port, occupied.port])).rejects.toThrow(String(occupied.port))
    await assertLoopbackPortsAvailable([port])
  })
})

describe('required-service supervision', () => {
  it.skipIf(process.platform === 'win32')('bounds shutdown of a TERM-resistant service and releases its real listener', async () => {
    const root = await project()
    await mkdir(path.join(root, 'fixtures'))
    await mkdir(path.join(root, 'scripts'))
    const entrypoint = await readFile(path.join(repository, 'scripts/start-demo.mjs'), 'utf8')
    const runtime = pathToFileURL(path.join(repository, 'scripts/demo-runtime.mjs')).href
    await writeFile(path.join(root, 'scripts/start-demo.mjs'), entrypoint.replace("'./demo-runtime.mjs'", JSON.stringify(runtime)))
    const infoFile = path.join(root, 'worker.json')
    await writeFile(path.join(root, 'fixtures/resist.cjs'), `
      const server = require('node:net').createServer();
      process.on('SIGTERM', () => console.log('fixture ignores TERM'));
      server.listen(0, '127.0.0.1', () => require('node:fs').writeFileSync(${JSON.stringify(infoFile)}, JSON.stringify({pid:process.pid, port:server.address().port})));
    `)
    await writeFile(path.join(root, 'fixtures/wait.cjs'), 'setInterval(() => {}, 1000)')
    await writeFile(path.join(root, 'fixtures/exit.cjs'), `setInterval(() => { if(require('node:fs').existsSync(${JSON.stringify(infoFile)})) process.exit(3) }, 50)`)
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: {
      'dev:inference': 'node fixtures/resist.cjs',
      'start:api': 'node fixtures/wait.cjs',
      preview: 'node fixtures/exit.cjs',
    } }))
    const child = spawn(process.execPath, ['scripts/start-demo.mjs'], {
      cwd: root, env: { ...process.env, ISEMO_PYTHON: process.execPath }, detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { output += chunk.toString() })
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Launcher did not stop within 19s:\n${output}`)), 19_000)
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', exitCode => { clearTimeout(timer); resolve(exitCode) })
      })
      expect(code).toBe(1)
      expect(output).toContain('Dịch vụ web đã thoát')
      expect(output).toContain('fixture ignores TERM')
      const worker = JSON.parse(await readFile(infoFile, 'utf8')) as { port: number }
      await assertLoopbackPortsAvailable([worker.port])
    } finally {
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL') } catch { /* process group already stopped */ }
      }
    }
  }, 25_000)

  it.each([0, 7])('stops siblings when a required service exits with code %s', async exitCode => {
    const root = await project()
    await mkdir(path.join(root, 'fixtures'))
    await writeFile(path.join(root, 'fixtures/wait.cjs'), 'setInterval(() => {}, 1000)')
    await writeFile(path.join(root, 'fixtures/exit.cjs'), `setTimeout(() => process.exit(${exitCode}), 500)`)
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: {
      'dev:inference': 'node fixtures/wait.cjs',
      'start:api': 'node fixtures/wait.cjs',
      preview: 'node fixtures/exit.cjs',
    } }))
    const run = startDemoServices(root, process.env)
    try {
      const events = await run.result.then(value => value, (value: unknown) => value)
      expect(Array.isArray(events)).toBe(true)
      if (!Array.isArray(events)) throw new Error('Missing service exit events')
      expect(events).toHaveLength(3)
      expect(events.find(event => event.command.name === 'web')?.exitCode).toBe(exitCode)
      expect(events.filter(event => event.command.name !== 'web').every(event => event.killed)).toBe(true)
      expect(run.commands.every(command => command.state === 'exited')).toBe(true)
    } finally {
      for (const command of run.commands) if (command.state === 'started') command.kill('SIGKILL')
    }
  })
})
