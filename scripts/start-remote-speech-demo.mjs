// Present existing real recorded Vietnamese speech without competing for the GPU.
// Takes WAV + reference text ONLY from already downloaded, revision-pinned
// FOSD/FLEURS (human voice) and optionally OneVoice (explicitly TTS).
// Isolated SQLite; never modifies production DB, original datasets or model files.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import net from 'node:net'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'linux') throw Error('Run the speech demo on FTISU Linux only.')
const home = process.env.HOME
if (!home || !home.startsWith('/')) throw Error('Absolute HOME is required.')
const dataDir = resolve(home, 'services/isemotalk-speech-demo')
const protectedDirs = [
  resolve(home, 'services/isemotalk-data'),
  resolve(home, 'services/isemotalk-midterm-demo'),
  resolve(home, 'services/isemotalk-private'),
  resolve(root, 'server/data'),
]
function overlaps(a, b) { return a === b || a.startsWith(b + sep) || b.startsWith(a + sep) }
if (existsSync(dataDir) && lstatSync(dataDir).isSymbolicLink())
  throw Error('Refusing symlink demo workspace.')
mkdirSync(dataDir, { recursive: true })
const real = realpathSync(dataDir)
for (const protectedDir of protectedDirs) {
  if (!existsSync(protectedDir)) continue
  if (overlaps(real, realpathSync(protectedDir)))
    throw Error('Refusing to overlap protected source/dataset/database path: ' + protectedDir)
}
const port = Number(process.env.PORT || '3101')
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3001, 8001].includes(port))
  throw Error('Invalid port. Default 3101 forwards over existing SSH tunnel.')
await new Promise((resolveListen, reject) => {
  const server = net.createServer()
  server.once('error', () => reject(new Error(
    'API port ' + port + ' occupied; stop ONLY remote:midterm-demo or remote:api-preview with Ctrl+C. Keep GPU runner alive.',
  )))
  server.listen(port, '127.0.0.1', () => server.close(resolveListen))
})
const env = { ...process.env, ISEMO_DATA_DIR: real, ISEMO_AUTO_SEED: '0',
  ISEMO_SPEECH_DEMO: '1', ISEMO_MIDTERM_DEMO: '0', PORT: String(port) }
console.log('[speech-demo] Importing actual human speech from pinned existing datasets; no new downloads and no CUDA.')
console.log('[speech-demo] FOSD/FLEURS: recorded human Vietnamese, not real call-center conversations.')
console.log('[speech-demo] OneVoice if present: intelligible TTS, NOT human voices or real customers.')
console.log('[speech-demo] No guessed SER emotion, no invented QA scores. Data folder:', real)
const seed = spawnSync(process.execPath, ['--import', 'tsx', 'server/src/seed-speech-demo.ts'], {
  cwd: root, env, stdio: 'inherit', shell: false,
})
if (seed.error || seed.status !== 0)
  throw Error('Human-speech demo preparation failed: ' + (seed.error?.message || seed.signal || seed.status))
const child = spawn(process.execPath, ['scripts/start-remote-api-preview.mjs'], {
  cwd: root, env, stdio: 'inherit', shell: false,
})
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => { if (child.exitCode === null && child.signalCode === null) child.kill(signal) })
child.on('error', error => { console.error('[speech-demo] API failed:', error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => {
  console.log('[speech-demo] API stopped:', signal || code)
  process.exitCode = code ?? 1
})
