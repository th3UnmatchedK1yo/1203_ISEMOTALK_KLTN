// Verify that the colocated API + Python inference are running real model adapters.
// A ready adapter is NOT a substitute for a real labeled audio smoke test.
const endpoints = [
  ['API', `http://127.0.0.1:${process.env.PORT || '3101'}/api/system/status`],
  ['inference', 'http://127.0.0.1:8001/v1/health'],
]
let failed = false
for (const [name,url] of endpoints) {
  try {
    const response = await fetch(url,{signal:AbortSignal.timeout(10000)})
    if(!response.ok)throw Error('HTTP '+response.status)
    const body = await response.json()
    const h = name === 'API' ? body.inference : body
    if(name === 'API' && !h?.reachable)throw Error(h?.error || 'API cannot reach Python inference')
    console.log(name+':',h.status,'mode='+h.mode)
    for(const kind of ['asr','diarization','ser']){
      const c=h.components?.[kind]
      if(!c)throw Error('Missing '+kind+' health')
      console.log('  '+kind+': '+c.adapter+', ready='+c.ready+', mock='+c.mock+', verified='+(c.verified??'not reported')+', loaded='+(c.loaded??'not reported'))
      if(kind !== 'diarization' && (!c.ready || c.mock)){console.error('  ERROR: '+kind+' must be genuine and ready.');failed=true}
      if(kind==='ser' && c.verified !== true){console.error('  ERROR: SER checkpoint not verified in the running inference process. Run held-out package verification and real audio smoke test.');failed=true}
    }
    console.log('  QA model: '+(h.qa?.adapter || '(unavailable)')+', ready='+Boolean(h.qa?.ready)+', domain='+(h.qa?.domain || 'unknown'))
    if(!h.qa?.ready){console.error('  ERROR: synthetic trained QA classifier missing; do not claim QA model deployment.');failed=true}
  }catch(e){failed=true;console.error(name+' unavailable:',e.message)}
}
console.log('This health check cannot establish held-out accuracy or cross-domain validity.')
if(failed)process.exitCode=1
