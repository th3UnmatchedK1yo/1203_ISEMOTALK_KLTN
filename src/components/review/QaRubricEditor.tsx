import { useMemo, useState } from 'react'
import { clock, type Utterance } from '@/api/isemotalk'
import { buildHumanRubricNote, emptyHumanRubric, QA_CRITERIA, scoreHumanRubric, type QaCriterionId, type QaCriterionInput } from '@/lib/qa-rubric'

export function QaRubricEditor({utterances,disabled,onApply,onEvidence}:{
  utterances:Utterance[]
  disabled:boolean
  onApply:(note:string)=>void
  onEvidence:(id:string,start:number)=>void
}) {
  const [answers,setAnswers]=useState(emptyHumanRubric)
  const [expanded,setExpanded]=useState(false)
  const ids=useMemo(()=>new Set(utterances.map(u=>u.id)),[utterances])
  const score=scoreHumanRubric(answers,ids)
  const set=(id:QaCriterionId,patch:Partial<QaCriterionInput>)=>{
    setAnswers(current=>({...current,[id]:{...current[id],...patch}}))
  }
  return <div className="mt-5 border-y border-slate-200 py-4">
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
      className="flex w-full items-start justify-between gap-3 text-left">
      <span>
        <strong className="block text-sm text-[#12394d]">Phiếu chấm QA theo 5 tiêu chí (tùy chọn)</strong>
        <span className="mt-1 block text-xs leading-5 text-slate-600">Người QA chấm sau khi nghe, không phải XLM-R tự chấm. Chỉ tính điểm khi đủ bằng chứng cho toàn bộ 100 trọng số.</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-teal-800">{expanded?'Thu gọn':'Mở phiếu'}</span>
    </button>
    {expanded&&<div className="mt-4 space-y-3">
      <p className="text-xs leading-5 text-slate-600">Trọng số 15–25–20–25–15 là đề xuất của ISEmoTalk, chưa phải chính sách của một tổng đài. Mục quy trình cần có mã/chính sách đối chiếu; mục kết quả cần dữ liệu CRM hoặc xác nhận ngoài cuộc gọi. Chọn đoạn âm thanh làm bằng chứng, ghi rõ căn cứ. Không đủ thông tin thì giữ “Chưa đủ bằng chứng”.</p>
      {QA_CRITERIA.map(c=>{
        const value=answers[c.id]
        const row=score.criteria.find(x=>x.id===c.id)!
        return <fieldset key={c.id} disabled={disabled} className="rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 text-sm font-bold text-slate-900">{c.label} · {c.weight} điểm</legend>
          <div className="grid gap-2 md:grid-cols-[12rem_minmax(0,1fr)]">
            <label className="text-xs font-semibold text-slate-600">Kết luận sau khi nghe
              <select className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                value={value.verdict} onChange={e=>set(c.id,{verdict:e.target.value as QaCriterionInput['verdict']})}>
                <option value="insufficient">Chưa đủ bằng chứng</option>
                <option value="pass">Đạt</option>
                <option value="fail">Không đạt</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Đoạn nghe làm bằng chứng
              <select className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                value={value.evidenceId} onChange={e=>set(c.id,{evidenceId:e.target.value})}>
                <option value="">Chưa chọn đoạn</option>
                {utterances.map(u=><option key={u.id} value={u.id}>{clock(u.start)} · {u.text.slice(0,70)}</option>)}
              </select>
            </label>
          </div>
          {value.evidenceId&&<button type="button" className="mt-2 text-xs font-semibold text-teal-800 hover:underline"
            onClick={()=>{
              const u=utterances.find(u=>u.id===value.evidenceId)
              if(u)onEvidence(u.id,u.start)
            }}>Nghe lại đoạn đã chọn</button>}
          <label className="mt-2 block text-xs font-semibold text-slate-600">
            {c.source==='policy'?'Mã chính sách, bước bắt buộc và căn cứ xác minh':
              c.source==='crm'?'Mã CRM/kết quả xử lý đã xác minh':'Ghi chú căn cứ'}
            <textarea className="mt-1 block min-h-16 w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900"
              value={value.note} maxLength={200}
              onChange={e=>set(c.id,{note:e.target.value})}
              placeholder={c.source==='policy'?'Ví dụ: SOP-01, mục 3.2; nội dung nhân viên đã thực hiện…':
                c.source==='crm'?'Ví dụ: ticket CRM #123, trạng thái đã xác nhận…':'Nêu ngắn gọn bằng chứng và lý do.'}/>
          </label>
          {value.verdict!=='insufficient'&&!row.valid&&<p className="mt-2 text-xs text-amber-800">
            Thiếu bằng chứng. {c.source==='policy'||c.source==='crm'?'Hãy chọn đoạn và ghi rõ căn cứ từ chính sách/CRM ít nhất 10 ký tự.':'Hãy chọn đoạn âm thanh đã kiểm tra.'}
          </p>}
        </fieldset>
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm">
        <p className="text-slate-700">
          Bao phủ <strong>{score.assessedWeight}/100</strong> trọng số · Điểm QA:
          <strong> {score.score===null?'Chưa thể tính':score.score+'/100'}</strong>
        </p>
        <button type="button" disabled={disabled||score.assessedWeight===0}
          onClick={()=>onApply(buildHumanRubricNote(answers,ids))}
          className="rounded-md bg-[#0E5665] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Đưa phiếu vào nhận xét QA
        </button>
      </div>
      <p className="text-xs leading-5 text-slate-500">Phiếu chỉ trở thành lịch sử QA sau khi bấm “Lưu đánh giá QA” bên dưới. Nếu không có chính sách hoặc kết quả CRM, không ép chấm đủ 100.</p>
    </div>}
  </div>
}
