// Run ACTUAL trained XLM-R QA (and optionally PhoWhisper ASR) on FTISU.
// Model inference runs in Python on GPU; Node uses an isolated, pre-existing
// SQLite workspace. This launcher does not train or fake SER predictions.
// No sudo, no mock seeding, no public listener, no .env overwrite.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import concurrently from 'concurrently'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', timeout: 5000,
}).trim()
if (!/^[a-f0-9]{40}$/.test(runtimeCommit)) throw Error('Cannot identify deployed source commit.')
if (process.platform !== 'linux') throw Error('FTISU Linux GPU host only.')
const home = process.env.HOME
if (!home || !home.startsWith('/')) throw Error('HOME must be absolute.')
const dataDir = resolve(process.env.ISEMO_DATA_DIR || join(home, 'services/isemotalk-speech-demo'))
const qaModelDir = resolve(process.env.ISEMO_QA_MODEL_DIR || join(home, 'services/isemotalk-private/models/qa-xlm-r-seed2026-v1'))
const python = resolve(process.env.ISEMO_PYTHON || join(root, 'inference/.venv/bin/python'))
const port = Number(process.env.PORT || '3101')
const inferencePort = Number(process.env.ISEMO_INFERENCE_PORT || '8001')
if (!Number.isInteger(inferencePort) || inferencePort < 1024 || inferencePort > 65535 ||
    !Number.isInteger(port) || port < 1024 || port > 65535 ||
    port === inferencePort || port === 3001)
  throw Error('Invalid or conflicting API/Python ports; both must be loopback-only and distinct.')
const asrRequested = process.argv.slice(2).includes('--asr')
const autoAsr = process.argv.slice(2).includes('--auto-asr')
if (process.argv.slice(2).some(arg => !['--asr', '--auto-asr'].includes(arg)) || (asrRequested && autoAsr))
  throw Error('Use --auto-asr (one-click), --asr (strict) or no flag (QA on source transcripts).')
let asrEnabled = asrRequested
// Explicit, source-pinned upgrade chosen by the student's FTISU staging step.
// No silent model substitution and no download of a bigger checkpoint during
// normal startup. Previous base ASR remains available when no upgrade exists.
let asrModel = 'vinai/PhoWhisper-base'
let asrRevision = '7ebdb9e88f5cc5271fb88f4d642c82ff9388650e'
const preferredAsrFile = join(home, '.local/share/isemotalk-asr/selected.json')
let selectedUpgrade = false
if ((asrRequested || autoAsr) && existsSync(preferredAsrFile)) {
  const selected = JSON.parse(readFileSync(preferredAsrFile, 'utf8'))
  if (!['vinai/PhoWhisper-medium', 'vinai/PhoWhisper-large'].includes(selected?.model_id) ||
      typeof selected?.revision !== 'string' || !/^[a-f0-9]{40}$/.test(selected.revision))
    throw Error('Unsupported ASR upgrade manifest. Re-run the safe staging script; refusing silent fallback.')
  asrModel = selected.model_id
  asrRevision = selected.revision
  selectedUpgrade = true
  console.log('[real-qa] Selected stronger pinned ASR model: ' + asrModel + '@' + asrRevision)
}
for (const file of [join(dataDir, 'isemotalk.db'), join(qaModelDir, 'training_result.json'), join(qaModelDir, 'model.safetensors'), python]) {
  if (!existsSync(file)) throw Error('Required existing research data/model/serving venv is missing: ' + file)
}
const training = JSON.parse(readFileSync(join(qaModelDir, 'training_result.json'), 'utf8'))
if (training.task !== 'call_level_needs_attention' || training.synthetic !== true ||
    training.dataset !== 'nhatminh/OneVoice' || !training.test_metrics ||
    !String(training.training_device || '').startsWith('cuda'))
  throw Error('Refusing QA checkpoint without the matching completed CUDA-training provenance.')
for (const bin of ['ffmpeg', 'ffprobe', 'nvidia-smi']) {
  try { execFileSync('/usr/bin/env', ['which', bin], { stdio: 'ignore', timeout: 5000 }) }
  catch { throw Error('Missing required audio/GPU utility: ' + bin) }
}
try {
  execFileSync(python, ['-c', 'import torch, transformers, fastapi, uvicorn; assert torch.cuda.is_available(), "CUDA unavailable"'], {
    stdio: 'inherit', timeout: 15000,
  })
} catch { throw Error('Serving Python needs CUDA torch, transformers, fastapi and uvicorn. Install them into the isolated inference/.venv first.') }
await new Promise((resolveListen, reject) => {
  const server = net.createServer()
  server.once('error', () => reject(new Error(
    'Port ' + port + ' is occupied. Stop ONLY the old remote:speech-demo/remote:api-preview terminal. Do not kill unrelated Node services.',
  )))
  server.listen(port, '127.0.0.1', () => server.close(resolveListen))
})
if (asrRequested || autoAsr) {
  const verifyCached = () => execFileSync(python, ['-c',
    'from huggingface_hub import snapshot_download; snapshot_download(repo_id=' +
      JSON.stringify(asrModel) + ', revision=' + JSON.stringify(asrRevision) + ', local_files_only=True)',
  ], { stdio: 'inherit', timeout: 15000 })
  try {
    verifyCached()
    asrEnabled = true
  } catch {
    if (selectedUpgrade) {
      throw Error('Selected ' + asrModel + ' checkpoint is not complete in HF cache. ' +
        'Re-run inference/scripts/stage_phowhisper_upgrade.py; never silently downgrade ASR.')
    }
    if (asrRequested) throw Error('Pinned PhoWhisper-base missing; cannot provide real ASR. Stage the exact model before --asr.')
    // Auto mode only stages the pinned original BASE once. Upgrading to
    // medium/large is deliberate and is never triggered without a disk preflight.
    try {
      console.log('[oneclick] PhoWhisper-base not cached; staging pinned baseline once (disk guarded).')
      execFileSync(python, ['scripts/stage_asr_demo.py'], {
        cwd: join(root, 'inference'), stdio: 'inherit', timeout: 240000,
        env: { ...process.env, HF_HUB_OFFLINE: '0', TRANSFORMERS_OFFLINE: '0' },
      })
      verifyCached()
      asrEnabled = true
    } catch (stageError) {
      console.warn('[oneclick] ASR could not be staged: ' + (stageError instanceof Error ? stageError.message : String(stageError)))
      console.warn('[oneclick] Continuing with REAL text QA only. Upload WAV needs available ASR.')
      asrEnabled = false
    }
  }
  if (asrEnabled && selectedUpgrade) {
    // A trained QA checkpoint also occupies the same FTISU GPU. Do not
    // evict unrelated research jobs or trigger a predictable CUDA OOM.
    let gpuFree = NaN
    try {
      const value = execFileSync('nvidia-smi',
        ['--query-gpu=memory.free', '--format=csv,noheader,nounits'],
        {encoding:'utf8', timeout:5000}).trim().split('\n')[0]
      gpuFree = Number(value.trim())
    } catch { /* No memory estimate available. CUDA will validate at loading. */ }
    const needMiB = asrModel.endsWith('large') ? 10000 : 6000
    if (Number.isFinite(gpuFree) && gpuFree < needMiB)
      throw Error('Only ' + gpuFree + ' MiB free CUDA memory; selected ' + asrModel +
        ' needs a safe ' + needMiB + ' MiB preflight budget. ' +
        'Do not stop other GPU jobs; use base or free memory by ending only the appropriate ISEmoTalk session.')
  }
}

const env = {
  ...process.env,
  ISEMO_RUNTIME_COMMIT: runtimeCommit,
  NODE_ENV: 'production',
  PORT: String(port),
  INFERENCE_URL: 'http://127.0.0.1:' + inferencePort,
  ISEMO_MODE: 'real',
  ISEMO_AUTO_SEED: '0',
  ISEMO_QA_AUTOMATION: '1',
  ISEMO_QA_EAGER_VERIFY: '1',
  ISEMO_API_PREVIEW_ONLY: '0',
  ISEMO_DATA_DIR: dataDir,
  ISEMO_UPLOADS_DIR: join(dataDir, 'uploads'),
  ISEMO_QA_MODEL_DIR: qaModelDir,
  ISEMO_ASR: asrEnabled ? 'phowhisper' : 'none',
  ISEMO_ASR_MODEL: asrModel,
  ISEMO_ASR_REVISION: asrRevision,
  ISEMO_ASR_DEVICE: 'cuda',
  ISEMO_SER: 'none',
  ISEMO_AUTO_QA_REAL_MODEL_ONLY: '1',
  ISEMO_DIARIZATION: 'none',
  ISEMO_ALLOW_UNVERIFIED: '0',
  HF_HUB_OFFLINE: '1',
  TRANSFORMERS_OFFLINE: '1',
  ISEMO_SPEECH_DEMO: dataDir === resolve(home, 'services/isemotalk-speech-demo') ? '1' : '0',
  ISEMO_MIDTERM_DEMO: '0',
}
console.log('[real-qa] Express/SQLite: http://127.0.0.1:' + port + ' on ' + dataDir)
console.log('[real-qa] Python: http://127.0.0.1:' + inferencePort + '; XLM-R QA trained checkpoint=' + qaModelDir)
console.log('[real-qa] ASR=' + (asrEnabled ? 'pinned ' + asrModel + ' CUDA' : 'explicitly unavailable (use source transcript)'))
console.log('[real-qa] SER=explicitly unavailable, no invented emotion/fusion. Real F4 requires separate verification.')
const commands = [
  { name: 'inference', command: 'node scripts/run-python.mjs -m uvicorn app.main:app --host 127.0.0.1 --port ' + inferencePort + ' --workers 1', env },
  { name: 'api', command: 'node --import tsx server/src/index.ts', env },
]
try {
  const run = concurrently(commands, {
    cwd: root, shell: '/bin/sh', prefix: '[{name}]', prefixColors: false,
    killOthersOn: ['success', 'failure'], killTimeout: 15000, successCondition: 'all',
  })
  await run.result
  process.exitCode = 1
} catch (error) {
  const events = Array.isArray(error) ? error : []
  console.error('[real-qa] A service ended:', events.map(event => event.command?.name + ':' + event.exitCode).join(' ') || String(error))
  process.exitCode = 1
}
