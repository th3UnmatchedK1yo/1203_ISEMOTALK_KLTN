// Verify real call-level QA classifier on a local FTISU GPU host (NO DB writes).
// The trained QA task is needs_attention; it is not four-class acoustic SER.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const folder = resolve(process.env.ISEMO_QA_MODEL_DIR || process.env.HOME + '/services/isemotalk-private/models/qa-xlm-r-seed2026-v1')
const report = resolve(folder, 'training_result.json')
if (!existsSync(report)) {
  console.error('[qa-smoke] Trained model report missing:', report)
  process.exit(2)
}
const info = JSON.parse(readFileSync(report,'utf8'))
if(info.task !== 'call_level_needs_attention' || info.synthetic !== true || !info.test_metrics)
  throw Error('Invalid QA training/heldout evidence.')
const sample='Khách hàng: Tôi đã gọi nhiều lần nhưng chưa nhận được khoản hoàn tiền. Nhân viên: Tôi sẽ tạo yêu cầu để kiểm tra tình trạng đơn hàng.'
const origin='http://127.0.0.1:8001'
const r=await fetch(origin+'/v1/qa/triage',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:sample}),
  signal:AbortSignal.timeout(180000),
})
if(!r.ok)throw Error('QA model unavailable HTTP '+r.status+': '+(await r.text()).slice(0,500))
const j=await r.json()
if(j.source!=='model' || j.dataset!=='synthetic_onevoice' || !Number.isFinite(j.score)
   || j.score<0 || j.score>1 || !/^[a-f0-9]{64}$/.test(j.modelSha256))
  throw Error('QA response is missing real-model lineage.')
console.log('PASS genuine CUDA-trained QA checkpoint inference; label='+j.label+', score='+j.score.toFixed(4))
console.log('model sha256='+j.modelSha256+'; held-out synthetic macro F1='+info.test_metrics.macro_f1)
console.log('IMPORTANT: This is synthetic-data QA, not real call-center accuracy and not SER.')
