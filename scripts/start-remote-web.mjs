// Frontend-only laptop runtime. Backend & models remain on the GPU server.
// SSH: ssh -N -L 127.0.0.1:13001:127.0.0.1:3101 ftisu-ser
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocalDemoApiTarget } from './demo-build.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const previewOnly = process.argv.slice(2).includes('--preview')
const qaMode = process.argv.slice(2).includes('--qa')
if(process.argv.slice(2).some(x => !['--preview','--qa'].includes(x)) || (previewOnly && qaMode))
 throw Error('Use --preview for API-only, --qa for genuine QA/optional ASR, or no flag for verified full ASR+SER.')
const port = Number(process.env.ISEMO_REMOTE_API_PORT || '13001')
const webPort = Number(process.env.ISEMO_WEB_PORT || '5173')
if(!Number.isInteger(webPort)||webPort<1024||webPort>65535||webPort===port)
  throw Error('ISEMO_WEB_PORT must be a separate local web port.')
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('ISEMO_REMOTE_API_PORT must be a local unprivileged port.')
const base = 'http://127.0.0.1:'+port
if(!existsSync(resolve(root,'dist/index.html')))throw Error('Missing dist. Run npm run build first.')
assertLocalDemoApiTarget(root)
let response,health
try{
 response=await fetch(base+'/api/system/status',{signal:AbortSignal.timeout(6000)})
 if(!response.ok)throw Error('HTTP '+response.status)
 health=await response.json()
}catch(e){
 console.error('GPU server API tunnel unavailable at '+base+'. First run the SSH -L forward in another terminal.')
 console.error('Details:',e.message)
 process.exit(1)
}
if(health?.api!=='ok')throw Error('Remote Node API did not return its health contract.')
if(!previewOnly) {
 if(!health?.inference?.reachable)throw Error('Remote Node API is not connected to its colocated Python inference.')
 if(!health.inference.qa?.ready)throw Error('Trained CUDA XLM-R QA classifier is not ready.')
 if(qaMode) {
   const asr=health.inference.components?.asr
   const ser=health.inference.components?.ser
   if(!ser || ser.adapter!=='not_configured' || ser.mock || ser.ready)
     throw Error('QA-only mode requires deliberately unavailable (not mock) SER.')
   if(!asr || asr.mock || (asr.adapter!=='not_configured' && !asr.ready))
     throw Error('QA-only mode requires genuine ready ASR, or explicit not_configured (never mock).')
   console.log('[remote-web] Genuine QA model available, ASR='+asr.adapter+', SER intentionally unavailable; no fake emotion.')
 } else {
 const comps=health.inference.components
 for(const kind of ['asr','ser']) {
  if(!comps?.[kind]?.ready || comps[kind].mock)throw Error('Refusing remote demo: '+kind+' model is not real and ready.')
 }
 if(comps.ser.verified!==true)throw Error('SER not verified in this running inference process. Run package verification and actual real-audio smoke test on the GPU host before starting the web.')
 if(!health.inference.qa?.ready)throw Error('Trained QA classifier not ready. Run bash scripts/train-callcenter-qa.sh on FTISU, then restart GPU services.')
 console.log('[remote-web] SSH tunnel OK; API + genuine model adapters reachable. Python and database are on the GPU server.')
 }
} else {
 console.warn('[FRONTEND PREVIEW ONLY] GPU training may be running; no ASR/SER/QA accuracy or end-to-end readiness is asserted.')
 console.warn('[FRONTEND PREVIEW ONLY] Calls, cases and SQLite UI can be exercised. Uploaded audio will NOT be processed until genuine inference is online.')
}
console.log('[remote-web] Open http://127.0.0.1:'+webPort+' (keep tunnel running).')
const vite = resolve(root,'node_modules/vite/bin/vite.js')
if(!existsSync(vite))throw Error('Vite missing. Run npm ci after stopping old Node processes.')
const child=spawn(process.execPath,[vite,'preview','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{
 cwd:root,env:{...process.env,ISEMO_WEB_API_TARGET:base},stdio:'inherit',shell:false
})
const shutdown=signal=>{if(child.exitCode===null && child.signalCode===null)child.kill(signal)}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>shutdown(sig))
child.on('error',e=>{console.error('[remote-web] Cannot start Vite:',e.message);process.exitCode=1})
child.on('exit',(code,signal)=>{console.log('[remote-web] Preview exited '+(signal||code));process.exitCode=code??1})
