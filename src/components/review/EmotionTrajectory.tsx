import { clock, emotionLabels, type CallDetail, type Emotion } from '@/api/isemotalk'

const colors:Record<Emotion,string> = { neutral:'bg-slate-400',happy:'bg-teal-600',sad:'bg-indigo-500',angry:'bg-rose-600' }
export function EmotionTrajectory({call,onSeek}:{
  call:CallDetail
  onSeek:(id:string,time:number)=>void
}){
  // Guard against imported demo predictions and unverified paper checkpoints.
  const ser=call.stageLog.find(step=>step.stage==='emotion')
  if(call.provenance!=='real'||ser?.state!=='done'||ser.evidence?.verified!==true)return null
  const valid=call.utterances.filter(u=>u.fused && u.end>u.start)
  if(!valid.length)return null
  const duration=Math.max(call.duration,...valid.map(u=>u.end),1)
  const rows=[
    {speaker:'customer',label:'Khách hàng'},
    {speaker:'agent',label:'Nhân viên'},
  ] as const
  const allKnown=valid.filter(u=>u.speaker==='customer'||u.speaker==='agent')
  return <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="emotion-timeline-title">
    <h2 id="emotion-timeline-title" className="text-base font-bold text-[#12394d]">Diễn biến cảm xúc theo thời gian</h2>
    <p className="mt-1 text-xs leading-5 text-slate-600">Chỉ các dự đoán của SER đã xác minh và đoạn đã có vai trò người nói. Màu biểu thị nhãn dự đoán, không chứng minh nhân viên làm sai.</p>
    <div className="mt-4 space-y-4">
      {rows.map(row=>{
        const items=allKnown.filter(u=>u.speaker===row.speaker&&u.fused)
        return <div key={row.speaker} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className="text-xs font-semibold text-slate-700">{row.label}</span>
          <div className="relative h-8 rounded-md bg-slate-100" role="group" aria-label={'Cảm xúc '+row.label}>
            {items.map(u=><button key={u.id} type="button" onClick={()=>onSeek(u.id,u.start)}
              style={{left:String(100*u.start/duration)+'%',width:String(Math.max(0.7,100*(u.end-u.start)/duration))+'%'}}
              className={'absolute top-1 h-6 rounded-sm opacity-90 hover:opacity-100 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-slate-900 '+colors[u.fused!.emotion]}
              title={clock(u.start)+'–'+clock(u.end)+' · '+emotionLabels[u.fused!.emotion]+' · chỉ số model '+u.fused!.confidence.toFixed(2)}
              aria-label={row.label+' '+clock(u.start)+' '+emotionLabels[u.fused!.emotion]}/>)}
            {!items.length&&<span className="absolute left-3 top-2 text-xs text-slate-500">Chưa có nhãn đủ điều kiện</span>}
          </div>
        </div>
      })}
    </div>
    <div className="mt-3 grid grid-cols-[6rem_minmax(0,1fr)] gap-3 text-xs text-slate-500">
      <span>Thời gian</span><div className="flex justify-between"><span>00:00</span><span>{clock(duration/2)}</span><span>{clock(duration)}</span></div>
    </div>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
      {(['neutral','happy','sad','angry'] as const).map(e=><span key={e} className="inline-flex items-center gap-1.5"><span className={'h-2.5 w-2.5 rounded-sm '+colors[e]}/>{emotionLabels[e]}</span>)}
    </div>
    {valid.length>allKnown.length&&<p className="mt-3 text-xs text-slate-600">{valid.length-allKnown.length} đoạn đã được SER dự đoán nhưng chưa xác nhận người nói nên chưa nằm trong hai hàng trên.</p>}
    <p className="mt-2 text-xs text-slate-500">Để đánh giá tính hữu ích, cần so sánh với dữ liệu thật có nhãn khách hàng và benchmark text-only; cảm xúc không phải kết luận QA.</p>
  </section>
}
