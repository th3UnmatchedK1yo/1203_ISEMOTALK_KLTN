/** Human-reviewed QA rubric. It is distinct from the synthetic XLM-R triage
 * index and distinct from an LLM's unverified suggestions.
 * Weights are a proposal; a real organization must approve them and supply
 * policy/CRM evidence before a full score is defensible.
 */
export const QA_CRITERIA = [
  {id:'understanding',label:'Nắm đúng yêu cầu của khách',weight:15,source:'audio_transcript'},
  {id:'accuracy',label:'Hướng dẫn nghiệp vụ chính xác',weight:25,source:'policy'},
  {id:'compliance',label:'Tuân thủ bước bắt buộc',weight:20,source:'policy'},
  {id:'resolution',label:'Kết quả và bước tiếp theo',weight:25,source:'crm'},
  {id:'communication',label:'Giao tiếp rõ ràng, phù hợp',weight:15,source:'audio_transcript'},
] as const

export type QaCriterionId = (typeof QA_CRITERIA)[number]['id']
export type QaVerdict = 'pass' | 'fail' | 'insufficient'
export interface QaCriterionInput {
  verdict: QaVerdict
  evidenceId: string
  note: string
}
export type QaRubricInput = Record<QaCriterionId, QaCriterionInput>

export function emptyHumanRubric(): QaRubricInput {
  return Object.fromEntries(QA_CRITERIA.map(c => [c.id, {
    verdict:'insufficient',evidenceId:'',note:'',
  }])) as QaRubricInput
}
export function scoreHumanRubric(inputs:QaRubricInput,availableIds:ReadonlySet<string>) {
  const checked=QA_CRITERIA.map(c=>{
    const input=inputs[c.id]
    const hasEvidence=availableIds.has(input.evidenceId)
    const external=c.source==='policy'||c.source==='crm'
    const valid=input.verdict!=='insufficient'&&hasEvidence&&
      (!external||input.note.trim().length>=10)
    const verdict:QaVerdict=valid?input.verdict:'insufficient'
    return {...c,verdict,valid,evidenceId:valid?input.evidenceId:null,note:input.note}
  })
  const assessedWeight=checked.filter(x=>x.valid).reduce((n,x)=>n+x.weight,0)
  const passed=checked.filter(x=>x.valid&&x.verdict==='pass').reduce((n,x)=>n+x.weight,0)
  return {criteria:checked,assessedWeight,score:assessedWeight===100?passed:null}
}
export function buildHumanRubricNote(inputs:QaRubricInput,availableIds:ReadonlySet<string>) {
  const score=scoreHumanRubric(inputs,availableIds)
  const rows=score.criteria.map(c=>
    c.label+': '+(c.verdict==='pass'?'Đạt':c.verdict==='fail'?'Không đạt':'Chưa đủ bằng chứng')+
    ' ('+c.weight+' điểm)'+(c.evidenceId?' · đoạn '+c.evidenceId:'')+
    (c.note.trim()?' · '+c.note.trim().replace(/\s+/g,' ').slice(0,200):''))
  return [
    '[PHIẾU QA CÓ BẰNG CHỨNG — NGƯỜI ĐÁNH GIÁ]',
    ...rows,
    'Bao phủ: '+score.assessedWeight+'/100 trọng số.',
    'Điểm chất lượng: '+(score.score===null?'Chưa đủ điều kiện tính':''+score.score+'/100'),
    'Đây là kết luận QA thủ công, không phải dự đoán XLM-R hay SER.',
    '[/PHIẾU QA]',
  ].join('\n')
}
