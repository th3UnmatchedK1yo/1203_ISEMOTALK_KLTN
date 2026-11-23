import {describe,it,expect} from 'vitest'
import {emptyHumanRubric,scoreHumanRubric,buildHumanRubricNote,QA_CRITERIA} from '../src/lib/qa-rubric'

describe('human QA rubric does not invent a quality grade',()=>{
  it('all unanswered criteria are unknown with no numerical score',()=>{
    const values=emptyHumanRubric()
    const result=scoreHumanRubric(values,new Set(['u1','u2']))
    expect(result.assessedWeight).toBe(0)
    expect(result.score).toBeNull()
    expect(result.criteria.every(c=>c.verdict==='insufficient')).toBe(true)
  })
  it('transcript-only criteria can be assessed but cannot form a 100-point score',()=>{
    const values=emptyHumanRubric()
    values.understanding={verdict:'pass',evidenceId:'u1',note:'Khách mô tả vấn đề.'}
    values.communication={verdict:'fail',evidenceId:'u2',note:'Khách chưa hiểu cách xử lý.'}
    const result=scoreHumanRubric(values,new Set(['u1','u2']))
    expect(result.assessedWeight).toBe(30)
    expect(result.score).toBeNull()
  })
  it('refuses to use invalid segment IDs or policy assessment with no external citation',()=>{
    const values=emptyHumanRubric()
    values.accuracy={verdict:'pass',evidenceId:'u9',note:'SOP XYZ'}
    values.resolution={verdict:'pass',evidenceId:'u1',note:'ok'}
    const result=scoreHumanRubric(values,new Set(['u1','u2']))
    expect(result.assessedWeight).toBe(0)
    expect(result.score).toBeNull()
  })
  it('calculates 100-point human score only when every criterion has matching evidence',()=>{
    const values=emptyHumanRubric()
    for(const criterion of QA_CRITERIA)values[criterion.id]={
      verdict:criterion.id==='compliance'?'fail':'pass',
      evidenceId:'u1',note:'Mã chính sách SOP-12; ticket CRM-95; đã đối chiếu.'
    }
    const result=scoreHumanRubric(values,new Set(['u1']))
    expect(result.assessedWeight).toBe(100)
    expect(result.score).toBe(80)
    const memo=buildHumanRubricNote(values,new Set(['u1']))
    expect(memo).toContain('80/100')
    expect(memo).toContain('[PHIẾU QA CÓ BẰNG CHỨNG')
    expect(memo).toContain('kết luận QA thủ công')
  })
})
