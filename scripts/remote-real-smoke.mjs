// End-to-end real ASR + SER remote host smoke test. Requires one permitted test audio file.
// Creates one REAL call in the remote SQLite database; never deletes it automatically.
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const raw = process.argv[2]
if (!raw || ['--help','-h'].includes(raw)) {
  console.error('Usage: node scripts/remote-real-smoke.mjs /absolute/path/to/permitted-vietnamese-clip.wav')
  process.exit(raw ? 0 : 2)
}
if (!path.isAbsolute(raw)) throw Error('Audio path must be absolute on the GPU server.')
const name = path.basename(raw)
if (!/\.(wav|mp3|m4a)$/i.test(name)) throw Error('Only WAV/MP3/M4A are supported.')
const bytes = statSync(raw).size
if (bytes < 1024 || bytes > 50*1024*1024) throw Error('Expected a short valid recording (1 KiB..50 MiB).')
const origin = `http://127.0.0.1:${process.env.PORT || '3101'}`
const before = await fetch(origin+'/api/system/status',{signal:AbortSignal.timeout(10000)}).then(r=>r.json())
for (const component of ['asr','ser']) {
  const state=before?.inference?.components?.[component]
  if (!state?.ready || state.mock) throw Error('Refusing smoke test: '+component+' is not a ready genuine model.')
}
const mime=name.toLowerCase().endsWith('.mp3')?'audio/mpeg':name.toLowerCase().endsWith('.m4a')?'audio/mp4':'audio/wav'
const form=new FormData()
form.append('audio',new Blob([readFileSync(raw)],{type:mime}),name)
form.append('title','REAL GPU smoke test - '+name.slice(0,120))
console.log('[smoke] Uploading ONE permitted recording to local GPU server API; creates a persisted case record.')
const createdResponse=await fetch(origin+'/api/calls/upload',{method:'POST',body:form,signal:AbortSignal.timeout(60000)})
const created=await createdResponse.json()
if(!createdResponse.ok || typeof created.id!=='string')throw Error('Upload failed: '+JSON.stringify(created).slice(0,1000))
console.log('[smoke] New call ID:',created.id)
const started=performance.now()
let detail
for(let i=0;i<120;i++){
  await new Promise(resolve=>setTimeout(resolve,3000))
  const response=await fetch(origin+'/api/calls/'+encodeURIComponent(created.id),{signal:AbortSignal.timeout(15000)})
  if(!response.ok)throw Error('Cannot read call status: HTTP '+response.status)
  detail=await response.json()
  if(['ready','failed'].includes(detail.status))break
  if(i%5===0)console.log('[smoke] '+Math.round((performance.now()-started)/1000)+'s status='+detail.status+' stage='+detail.stage)
}
if(detail?.status!=='ready'){
  console.error('[smoke] Job not ready; call is persisted for retry:',created.id,'status=',detail?.status,'error=',detail?.error)
  process.exit(1)
}
const log=detail.stageLog
if(!Array.isArray(log))throw Error('Missing stage log.')
for(const name of ['transcribe','emotion']){
  const st=log.find(x=>x.stage===name)
  if(st?.state!=='done' || st.provenance!=='real' || st.evidence?.mock!==false) {
    throw Error('Unverified or mocked '+name+' step; check the stage log and model assets.')
  }
  if(name==='emotion' && st.evidence?.verified!==true)throw Error('SER inference completed but package is NOT verified.')
}
if(!Array.isArray(detail.utterances) || !detail.utterances.length)throw Error('No utterances produced.')
console.log('[smoke] PASS real ASR+SER end to end, call='+created.id+', utterances='+detail.utterances.length)
console.log('[smoke] Wall time seconds: '+((performance.now()-started)/1000).toFixed(1))
for(const st of log)console.log('  '+st.stage+': '+st.state+' '+(st.durationMs??'?')+'ms evidence='+(st.evidence?.model??st.evidence?.adapter??'none'))
console.log('[smoke] This is a SYSTEM acceptance test, not SER accuracy proof; independently evaluate labeled speech and QA metrics.')
