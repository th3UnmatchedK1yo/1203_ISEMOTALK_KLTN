// Isolated, persistent MOCK-DATA workspace for a midterm browser demonstration.
// Runs only the Node/SQLite API preview; DOES NOT start Python, touch real
// recordings/checkpoints, or consume GPU. Never point this at an operational DB.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import net from 'node:net'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'linux') throw Error('This launcher is only for the FTISU Linux host.')
const home = process.env.HOME
if (!home || !home.startsWith('/')) throw Error('A valid absolute HOME directory is required.')
const demoDir = resolve(home, 'services/isemotalk-midterm-demo')
const productionDir = resolve(home, 'services/isemotalk-data')
const repoDataDir = resolve(root, 'server/data')
const apiPort = Number(process.env.PORT || '3101')
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535 || apiPort === 3001 || apiPort === 8001)
  throw Error('Invalid API port; 3101 is the default. Ports 3001/8001 are reserved.')

function overlaps(a, b) {
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep)
}
if (existsSync(demoDir) && lstatSync(demoDir).isSymbolicLink()) {
  throw Error('Refusing a symbolic-link demo directory.')
}
mkdirSync(demoDir, { recursive: true })
const realDemo = realpathSync(demoDir)
for (const protectedDir of [productionDir, repoDataDir]) {
  if (existsSync(protectedDir) && overlaps(realDemo, realpathSync(protectedDir))) {
    throw Error('Refusing demo path overlapping production or repo data: ' + realDemo)
  }
}
if (process.env.ISEMO_OPERATIONAL_DATA_DIR && existsSync(process.env.ISEMO_OPERATIONAL_DATA_DIR) &&
    overlaps(realDemo, realpathSync(process.env.ISEMO_OPERATIONAL_DATA_DIR))) {
  throw Error('Refusing overlap with the configured operational data directory.')
}
await new Promise((ok, fail) => {
  const socket = net.createServer()
  socket.once('error', () => fail(new Error(
    'Port ' + apiPort + ' is already occupied. Stop ONLY the existing API-preview terminal with Ctrl+C; do not stop GPU training.',
  )))
  socket.listen(apiPort, '127.0.0.1', () => socket.close(ok))
})
const environment = {
  ...process.env,
  ISEMO_DATA_DIR: realDemo,
  ISEMO_UPLOADS_DIR: resolve(realDemo, 'uploads'),
  ISEMO_AUTO_SEED: '0',
  ISEMO_MIDTERM_DEMO: '1',
  PORT: String(apiPort),
}
console.log('[midterm] Isolated database:', realDemo)
console.log('[midterm] All sample calls have provenance=mock; audio is synthetic tones, NOT speech.')
console.log('[midterm] Does not touch production DB or start Python inference.')
const seed = spawnSync(process.execPath, ['--import', 'tsx', 'server/src/seed-cli.ts'], {
  cwd: root, env: environment, stdio: 'inherit', shell: false,
})
if (seed.error || seed.status !== 0) throw Error('Isolated demo seed failed: ' + (seed.error?.message || seed.signal || seed.status))
const child = spawn(process.execPath, ['scripts/start-remote-api-preview.mjs'], {
  cwd: root, env: environment, stdio: 'inherit', shell: false,
})
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  if (child.exitCode === null && child.signalCode === null) child.kill(signal)
})
child.on('error', error => {
  console.error('[midterm] API failed:', error.message)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  console.log('[midterm] Preview stopped:', signal || code)
  process.exitCode = code ?? 1
})
