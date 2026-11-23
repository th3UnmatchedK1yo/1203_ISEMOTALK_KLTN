// Read-only MVP wiring check: Windows Vite preview -> SSH -> FTISU Express/SQLite.
// Deliberately does not require Python inference, alter records or seed mock data.
const apiPort = Number(process.env.ISEMO_REMOTE_API_PORT || '13001')
const webPort = Number(process.env.ISEMO_MVP_WEB_PORT || '5173')
function port(n) { return Number.isInteger(n) && n >= 1024 && n <= 65535 }
if (!port(apiPort) || !port(webPort) || apiPort === webPort) {
  throw Error('Set different local unprivileged ISEMO_REMOTE_API_PORT and ISEMO_MVP_WEB_PORT values.')
}
const direct = 'http://127.0.0.1:' + apiPort
const web = 'http://127.0.0.1:' + webPort
async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) })
  if (!response.ok) throw Error(url + ' returned HTTP ' + response.status)
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) throw Error(url + ' returned ' + (type || 'non-JSON'))
  return await response.json()
}
try {
  const api = await getJson(direct + '/api/system/status')
  if (api?.api !== 'ok' || api.previewOnly !== true || api.inference?.reachable !== false)
    throw Error('Expected FTISU API-only preview; got a different/unexpected service.')
  console.log('[mvp] FTISU API reachable, Python model execution intentionally OFF.')

  const calls = await getJson(direct + '/api/calls')
  if (!Number.isInteger(calls?.total) || !Array.isArray(calls.items))
    throw Error('/api/calls is not returning the list contract.')
  if (api.demoData === true) {
    if (calls.total < 1 || !calls.items.some(item => item.provenance === 'mock'))
      throw Error('Mock-data demo flag is on but no labeled sample calls are available.')
    console.log('[mvp] MIDTERM MOCK DATA WORKSPACE — synthetic audio has no speech; model predictions are not real.')
  }
  const cases = await getJson(direct + '/api/cases')
  if (!Number.isInteger(cases?.total) || !Array.isArray(cases.items))
    throw Error('/api/cases is not returning the list contract.')
  const analytics = await getJson(direct + '/api/analytics')
  if (!analytics?.status || !analytics?.provenance)
    throw Error('/api/analytics is missing its summary contract.')
  console.log('[mvp] SQLite reads OK: calls=' + calls.total + ', cases=' + cases.total + ', analytics available.')

  const page = await fetch(web, { signal: AbortSignal.timeout(7000) })
  if (!page.ok || !(page.headers.get('content-type') || '').includes('text/html'))
    throw Error('Frontend is not serving HTML at ' + web + ' (HTTP ' + page.status + ').')
  const html = await page.text()
  if (!html.includes('id="root"')) throw Error('Frontend HTML has no React root.')
  const throughWeb = await getJson(web + '/api/system/status')
  if (throughWeb?.api !== 'ok' || throughWeb.previewOnly !== true)
    throw Error('Vite /api proxy does not reach the FTISU preview API.')
  console.log('[mvp] React build and Vite API proxy reachable at ' + web)
  console.log('[mvp] PASS read-only workflow wiring. NOT proof of ASR/SER/QA inference or real-world accuracy.')
} catch (error) {
  console.error('[mvp] FAIL:', error?.message || String(error))
  console.error('[mvp] Check both FTISU remote:api-preview and Windows SSH tunnel. Use curl.exe --max-time 8 -i ' + direct + '/api/system/status; then start-vscode-preview.ps1.')
  process.exitCode = 1
}
