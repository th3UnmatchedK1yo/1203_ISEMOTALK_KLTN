// Frontend-only laptop runtime. Backend & models remain on the GPU server.
// SSH: ssh -N -L 127.0.0.1:13001:127.0.0.1:3001 ftisu-ser
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLocalDemoApiTarget } from './demo-build.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const port = Number(process.env.ISEMO_REMOTE_API_PORT || '13001')
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
if(health?.api!=='ok'||!health?.inference?.reachable)throw Error('Remote Node API is not connected to its colocated Python inference.')
const comps=health.inference.components
for(const kind of ['asr','ser']) {
 if(!comps?.[kind]?.ready || comps[kind].mock)throw Error('Refusing remote demo: '+kind+' model is not real and ready.')
}
if(comps.ser.verified!==true)throw Error('SER not verified in this running inference process. Run package verification and actual real-audio smoke test on the GPU host before starting the web.')
console.log('[remote-web] SSH tunnel OK; API + genuine model adapters reachable. Python and database are on the GPU server.')
console.log('[remote-web] Open http://127.0.0.1:5173 (keep tunnel running).')
const vite = resolve(root,'node_modules/vite/bin/vite.js')
if(!existsSync(vite))throw Error('Vite missing. Run npm ci after stopping old Node processes.')
const child=spawn(process.execPath,[vite,'preview','--host','127.0.0.1','--port','5173','--strictPort'],{
 cwd:root,env:{...process.env,ISEMO_WEB_API_TARGET:base},stdio:'inherit',shell:false
})
const shutdown=signal=>{if(child.exitCode===null && child.signalCode===null)child.kill(signal)}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>shutdown(sig))
child.on('error',e=>{console.error('[remote-web] Cannot start Vite:',e.message);process.exitCode=1})
child.on('exit',(code,signal)=>{console.log('[remote-web] Preview exited '+(signal||code));process.exitCode=code??1})
