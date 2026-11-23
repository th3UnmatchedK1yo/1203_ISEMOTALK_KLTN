// Read-only check for a genuine QA deployment over the Windows SSH tunnel.
// Unlike remote:mvp-check this requires Python inference + trained XLM-R.
// Does not upload, run model inference, or write into SQLite.
const port = Number(process.env.ISEMO_REMOTE_API_PORT || process.env.PORT || '13001')
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error('Invalid local API port.')
const base = 'http://127.0.0.1:' + port
async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw Error('HTTP ' + res.status + ' at ' + url)
  return res.json()
}
try {
  const h = await json(base + '/api/system/status')
  if (h.api !== 'ok' || h.previewOnly || !h.inference?.reachable)
    throw Error('API-only preview still active; start actual QA Python+Express runtime on FTISU.')
  const c = h.inference.components
  if (!h.inference.qa?.ready || h.inference.qa.domain !== 'synthetic_onevoice')
    throw Error('XLM-R trained QA model missing or incompatible.')
  if (c?.ser?.adapter !== 'not_configured' || c.ser.ready || c.ser.mock)
    throw Error('SER is not explicitly disabled in genuine partial QA mode.')
  if (c?.asr?.mock || (c.asr?.adapter !== 'not_configured' && !c.asr?.ready))
    throw Error('ASR is mocked or not genuinely configured.')
  const list = await json(base + '/api/calls?pageSize=10')
  if (!Array.isArray(list.items)) throw Error('Call list unreadable.')
  console.log('[real-qa] PASS Express ↔ Python ↔ checkpoint availability.')
  console.log('[real-qa] QA trained XLM-R (synthetic OneVoice); ASR=' + c.asr.adapter + ', ready=' + c.asr.ready)
  console.log('[real-qa] SER=' + c.ser.adapter + ' (deliberately skipped, NO emotion predictions).')
  console.log('[real-qa] Calls in SQLite=' + list.total + '. No AI prediction was executed by this read-only check.')
  console.log('[real-qa] Next: on FTISU run npm run remote:qa-smoke to evaluate a real model response without DB writes.')
} catch (error) {
  console.error('[real-qa] FAIL:', error?.message || String(error))
  process.exitCode = 1
}
