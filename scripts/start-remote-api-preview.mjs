// FTISU preview-only API, no inference process and NO model operations.
// Enables QA/Cases/frontend work while the single GPU is training models.
// Bind loopback only, preserve the SAME SQLite and audio directory that the
// genuine remote:server launcher will use after training is finished.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'linux') throw Error('remote:api-preview is for the Linux GPU host only.')
const nodeModules = resolve(root, 'node_modules/tsx')
if (!existsSync(nodeModules)) throw Error('Server Node dependencies are missing; run npm ci first.')
const file = resolve(root, 'inference/.env')
const config = Object.fromEntries((existsSync(file) ? readFileSync(file, 'utf8') : '')
  .split(/\r?\n/)
  .map(x => x.trim()).filter(x => /^ISEMO_[A-Z_]+=/i.test(x))
  .map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)] }))
const dir = process.env.ISEMO_DATA_DIR || config.ISEMO_DATA_DIR ||
  resolve(process.env.HOME || root, 'services/isemotalk-data')
const apiPort = Number(process.env.PORT || 3101)
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535 || apiPort === 8001)
  throw Error('Invalid API port. Use default 3101; never override server port 3001.')
if (apiPort === 3001) throw Error('Refusing :3001; another service owns it.')
console.log('[preview] API-only, no Python inference. Model processing WILL NOT work in this mode.')
console.log('[preview] SQLite:', dir, '| port:', apiPort, '| no mock seeding.')
const child = spawn(process.execPath, ['--import','tsx','server/src/index.ts'], {
  cwd: root, env: { ...process.env, NODE_ENV:'production', ISEMO_AUTO_SEED:'0', ISEMO_API_PREVIEW_ONLY:'1',
    ISEMO_DATA_DIR:dir, ISEMO_UPLOADS_DIR:resolve(dir,'uploads'),
    INFERENCE_URL:'http://127.0.0.1:8001', PORT:String(apiPort) },
  stdio:'inherit',shell:false,
})
for (const signal of ['SIGTERM','SIGINT']) {
  process.on(signal, () => child.kill(signal))
}
child.on('error', e => { console.error('[preview] API failed:',e.message);process.exitCode=1 })
child.on('exit',(code,signal) => {
  console.log('[preview] API-only process ended:',signal||code)
  process.exitCode=code??1
})
