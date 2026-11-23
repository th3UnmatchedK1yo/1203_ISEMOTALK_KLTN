// Read-only preflight for the GPU host. Requires ONLY Node.js 22+.
// This is not a deployment or a guarantee that trained SER is accurate.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const problems = []
const envPath = resolve(root, 'inference/.env')
const env = Object.fromEntries((existsSync(envPath) ? readFileSync(envPath, 'utf8') : '').split(/\r?\n/)
  .map(x => x.trim()).filter(x => x && !x.startsWith('#') && x.includes('='))
  .map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)] }))
const read = name => process.env[name] ?? env[name] ?? ''
const asr = read('ISEMO_ASR')
const ser = read('ISEMO_SER')
const factory = read('ISEMO_SER_FACTORY')
const config = read('ISEMO_SER_CONFIG')
const uploads = read('ISEMO_UPLOADS_DIR')
const data = resolve(process.env.ISEMO_DATA_DIR || 'server/data')
console.log('ISEmoTalk remote GPU preflight (does not install/download/modify anything)')
console.log('Host:', os.hostname(), 'OS:', process.platform, 'RAM GiB:', (os.totalmem()/2**30).toFixed(1))
console.log('ASR:', asr || '(not configured)', '| SER:', ser || '(not configured)')
console.log('Database and audio directory:', data)
if (asr === 'mock' || !asr) problems.push('ASR is not configured as a real model.')
if (ser !== 'checkpoint') problems.push('SER must be checkpoint; mock is not acceptable for remote inference.')
if (!factory || !config) problems.push('ISEMO_SER_FACTORY and ISEMO_SER_CONFIG must identify a verified private package.')
if (config && !isAbsolute(config)) problems.push('ISEMO_SER_CONFIG must be an absolute Linux path.')
if (config && !existsSync(config)) problems.push('Private SER configuration file does not exist at the configured path.')
const py = process.env.ISEMO_PYTHON || resolve(root,'inference/.venv/bin/python')
if (!existsSync(py)) problems.push('Python inference environment does not exist: '+py+'; create/use an approved GPU Python venv.')
if (!existsSync(resolve(root,'node_modules'))) problems.push('Node modules missing; run npm ci on the server.')
if (uploads && resolve(uploads) !== resolve(data, 'uploads')) problems.push('ISEMO_UPLOADS_DIR must match ISEMO_DATA_DIR/uploads.')
if (process.env.PORT && process.env.PORT !== '3001') problems.push('This local SSH-forward setup expects API port 3001.')
if (process.env.INFERENCE_URL && process.env.INFERENCE_URL !== 'http://127.0.0.1:8001') problems.push('Inference must run on same host at 127.0.0.1:8001.')
try {
  const info = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader'], {encoding:'utf8', timeout:5000}).trim()
  console.log('GPU:', info)
} catch { problems.push('nvidia-smi unavailable. Check remote GPU environment before deploying.') }
console.log('This check cannot confirm model weights, ASR model load, SER accuracy, or data permissions.')
if(problems.length){for(const p of problems)console.error('NOT READY:',p);process.exitCode=1}
else console.log('Configuration preflight passed. Next: verify model package + run end-to-end audio smoke test on this host.')
