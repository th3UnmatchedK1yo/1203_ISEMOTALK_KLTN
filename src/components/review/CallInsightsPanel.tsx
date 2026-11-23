import { useEffect, useState } from 'react'
import { apiJson, clock, type Utterance } from '@/api/isemotalk'

interface Claim { text:string; evidenceIds:string[] }
interface Insight {
  source:'local_llm'
  model:string
  issue:Claim
  response:Claim
  outcome:{status:'resolved_claimed'|'unresolved'|'unknown';summary:string;evidenceIds:string[]}
  risks:Claim[]
  coaching:Claim
  rubric:Array<{id:string;title:string;weight:number;source:string;verdict:'pass'|'fail'|'unknown';reason:string;evidenceIds:string[]}>
  availableWeight:number
  qaScore:number|null
  truncated:boolean
  note:string
  saved:boolean
}
export function CallInsightsPanel({callId,utterances,onEvidence}:{
  callId:string
  utterances:Utterance[]
  onEvidence:(id:string,start:number)=>void
}) {
  const [enabled,setEnabled]=useState(false)
  const [model,setModel]=useState<string|null>(null)
  const [checking,setChecking]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [insight,setInsight]=useState<Insight|null>(null)

  useEffect(()=>{
    const controller=new AbortController()
    setChecking(true)
    apiJson<{enabled:boolean;model:string|null}>('/api/insights/status',{signal:controller.signal})
      .then(status=>{if(!controller.signal.aborted){setEnabled(status.enabled);setModel(status.model)}})
      .catch(()=>{if(!controller.signal.aborted)setEnabled(false)})
      .finally(()=>{if(!controller.signal.aborted)setChecking(false)})
    return ()=>controller.abort()
  },[callId])

  const run=async()=>{
    if(!enabled||busy)return
    setError('');setBusy(true)
    try{setInsight(await apiJson<Insight>('/api/calls/'+encodeURIComponent(callId)+'/insights',{method:'POST'}))}
    catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  const links=(ids:string[])=>ids.map(id=>{
    const u=utterances.find(item=>item.id===id)
    return u?<button key={id} type="button" onClick={()=>onEvidence(u.id,u.start)}
      className="inline-flex rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-teal-800 hover:border-teal-400 hover:bg-slate-50"
      title={u.text}>Nghe {clock(u.start)}</button>:null
  })

  if(checking)return <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">Đang kiểm tra LLM local…</p>
  if(!enabled)return <p className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
    <strong>Tóm tắt nguyên nhân (LLM):</strong> chưa bật model local trên FTISU. Transcript và XLM-R vẫn có thể dùng; không hiển thị tóm tắt giả.
  </p>
  return <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="insight-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="insight-title" className="text-lg font-bold text-[#12394d]">Nguyên nhân & gợi ý coaching</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">LLM nội bộ {model} · chạy khi người QA yêu cầu · chỉ dùng transcript có bằng chứng</p>
      </div>
      <button type="button" disabled={busy} onClick={()=>void run()}
        className="rounded-md bg-[#0E5665] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy?'Đang phân tích…':insight?'Phân tích lại':'Phân tích bằng LLM'}
      </button>
    </div>
    {error&&<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {insight&&<>
      <p className="mt-3 border-l-[3px] border-amber-400 bg-amber-50/50 px-3 py-2 text-xs leading-5 text-slate-800">
        {insight.truncated?'Chỉ đọc được một phần transcript vì giới hạn ngữ cảnh. ':''}
        Đây là gợi ý AI chưa lưu vào kết luận QA; bấm mốc thời gian để đối chiếu trước khi sử dụng.
      </p>
      <div className="mt-4 space-y-4 text-sm leading-6">
        {([
          ['Khách đang gặp vấn đề gì?',insight.issue],
          ['Phản hồi được nhận diện từ cuộc gọi',insight.response],
          ['Kết quả/ bước xử lý tiếp', {text:insight.outcome.summary,evidenceIds:insight.outcome.evidenceIds}],
          ['Gợi ý coaching',insight.coaching],
        ] as Array<[string,Claim]>).map(([label,detail])=><div key={label}>
          <h3 className="text-sm font-bold text-slate-900">{label}</h3>
          <p className="mt-0.5 text-slate-700">{detail.text}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{links(detail.evidenceIds)}</div>
          {!detail.evidenceIds.length&&<p className="text-xs text-amber-800">Chưa có đoạn chứng minh; không dùng để kết luận.</p>}
        </div>)}
        {insight.risks.length>0&&<div>
          <h3 className="font-bold text-slate-900">Dấu hiệu cần QA nghe lại</h3>
          {insight.risks.map((r,i)=><div key={i} className="mt-2 border-l-2 border-amber-300 pl-3">
            <p>{r.text}</p><div className="mt-1 flex flex-wrap gap-1">{links(r.evidenceIds)}</div>
          </div>)}
        </div>}
      </div>
      <details className="mt-5 border-t border-slate-200 pt-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">Rubric QA (5 tiêu chí, 100 điểm) · xem lý do chưa thể chấm</summary>
        <p className="mt-2 text-xs leading-5 text-slate-700">Trọng số là đề xuất để QA kiểm chứng với doanh nghiệp, không phải tiêu chuẩn đã được xác nhận. Không coi thiếu bằng chứng là điểm 0.</p>
        <div className="mt-3 divide-y divide-slate-100">
          {insight.rubric.map(c=><div key={c.id} className="py-3 text-sm">
            <div className="flex justify-between gap-2"><strong>{c.title} · {c.weight} điểm</strong>
              <span className="text-xs font-semibold">{c.verdict==='pass'?'AI gợi ý đạt':c.verdict==='fail'?'AI gợi ý xem lỗi':'Chưa đủ chứng cứ'}</span></div>
            <p className="mt-1 leading-6 text-slate-700">{c.reason}</p>
            <div className="mt-1 flex flex-wrap gap-1">{links(c.evidenceIds)}</div>
          </div>)}
        </div>
        <p className="mt-3 text-sm font-semibold">Trọng số đủ chứng cứ gợi ý: {insight.availableWeight}/100 · Điểm chất lượng: {insight.qaScore===null?'Chưa thể chấm':insight.qaScore+'/100'}</p>
        <p className="mt-2 text-xs text-slate-600">{insight.note}</p>
      </details>
    </>}
  </section>
}
