// Deploy backend + inference on ONE trusted Linux GPU host.
// The two processes share server/data/uploads; no remote-path shortcut is used.
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import concurrently from 'concurrently'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if(process.platform !== 'linux')throw Error('remote:server targets the group Linux GPU server only.')
try {
 execFileSync(process.execPath,['scripts/check-remote-server.mjs'],{cwd:root,stdio:'inherit',env:process.env})
} catch(e) {
 console.error('[remote] Configuration preflight failed. No services started; resolve missing verified-model assets first.')
 process.exit(1)
}
// Use a separate API port on the shared training server; never stop whoever owns :3001.
const apiPort = Number(process.env.PORT || '3101')
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535 || apiPort === 8001)
  throw new Error('Invalid API PORT (expected a port distinct from inference :8001).')
// The Node API must use the SAME data directory as Python configured in
// inference/.env. This intentionally avoids accidentally starting a second DB.
const envFile = resolve(root, 'inference/.env')
const configured = Object.fromEntries((existsSync(envFile) ? readFileSync(envFile,'utf8') : '')
  .split(/\r?\n/).filter(line => /^ISEMO_[A-Z_]+\s*=/.test(line.trim()))
  .map(line => { const idx=line.indexOf('='); return [line.slice(0,idx).trim(),line.slice(idx+1).trim()] }))
const dataDir = process.env.ISEMO_DATA_DIR || configured.ISEMO_DATA_DIR || resolve(root, 'server/data')
const childEnv = {
 ...process.env,
 NODE_ENV:'production',
 ISEMO_AUTO_SEED:'0',
 ISEMO_DATA_DIR:dataDir,
 ISEMO_UPLOADS_DIR:resolve(dataDir,'uploads'),
 PORT:String(apiPort),
 INFERENCE_URL:'http://127.0.0.1:8001',
}
console.log(`[remote] Starting Python :8001 and API :${apiPort}, both loopback-only on this GPU host.`)
console.log('[remote] All DB/recording files remain on this host; connect using SSH local-forward.')
const commands=[
 {name:'inference',command:'node scripts/run-python.mjs -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 1',env:childEnv},
 {name:'api',command:'node --import tsx server/src/index.ts',env:childEnv},
]
try{
 const run=concurrently(commands,{cwd:root,shell:'/bin/sh',prefix:'[{name}]',prefixColors:false,killOthersOn:['success','failure'],killTimeout:15000,successCondition:'all'})
 await run.result
 console.error('[remote] Services exited. Never claim the GPU service is ready without health + real audio smoke test.')
 process.exitCode=1
}catch(e){
 const events=Array.isArray(e)?e:[]
 console.error('[remote] A service exited or failed:',events.map(x=>x.command?.name+':'+x.exitCode).join(' ') || String(e))
 process.exitCode=1
}
