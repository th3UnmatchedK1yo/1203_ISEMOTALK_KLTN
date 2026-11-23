import { afterEach, describe, expect, it } from 'vitest'
import { validateInsights } from '../src/insights'
import { makeApp } from './helpers'

const sample={
 issue:{text:'Khách cần hỗ trợ tài khoản.',evidenceIds:['u1','ghost']},
 response:{text:'Nhân viên hướng dẫn thao tác.',evidenceIds:['u2']},
 outcome:{status:'unknown',summary:'Không đủ bằng chứng về kết quả.',evidenceIds:['u1']},
 risks:[{text:'Cần nghe lại',evidenceIds:['ghost']},{text:'Có câu hỏi chưa rõ',evidenceIds:['u1']}],
 coaching:{text:'Hỏi lại khách đã hoàn thành bước chưa.',evidenceIds:['u2']},
 criteria:[
  {id:'understanding',verdict:'pass',reason:'Đã nhắc lại yêu cầu.',evidenceIds:['u1','u2']},
  {id:'accuracy',verdict:'pass',reason:'LLM đoán đúng.',evidenceIds:['u2']},
  {id:'compliance',verdict:'pass',reason:'LLM đoán tuân thủ.',evidenceIds:['u2']},
  {id:'resolution',verdict:'pass',reason:'LLM đoán xong.',evidenceIds:['u2']},
  {id:'communication',verdict:'pass',reason:'Tương tác rõ.',evidenceIds:['u1','u2']},
 ],
}
describe('evidence-first local QA insights',()=>{
 it('does not fabricate roles, CRM outcomes, policy compliance or a numeric quality grade',()=>{
  const result=validateInsights(sample,[{id:'u1',speaker:'unknown'},{id:'u2',speaker:'unknown'}],'qwen-local',false)
  expect(result.availableWeight).toBe(0)
  expect(result.qaScore).toBeNull()
  expect(result.rubric.every(c=>c.verdict==='unknown')).toBe(true)
  expect(result.issue.evidenceIds).toEqual(['u1'])
  expect(result.risks).toHaveLength(1)
 })
 it('can suggest transcript-only checks but never score absent policy and CRM',()=>{
  const result=validateInsights(sample,[{id:'u1',speaker:'customer'},{id:'u2',speaker:'agent'}],'qwen-local',false)
  expect(result.availableWeight).toBe(30)
  expect(result.qaScore).toBeNull()
  expect(result.rubric.find(c=>c.id==='compliance')?.verdict).toBe('unknown')
 })
 it('abstains on truncated context even with explicit speaker roles',()=>{
  const result=validateInsights(sample,[{id:'u1',speaker:'customer'},{id:'u2',speaker:'agent'}],'qwen-local',true)
  expect(result.availableWeight).toBe(0)
 })
})
describe('unconfigured LLM endpoint',()=>{
 const previous=process.env.ISEMO_LLM_ENABLED
 afterEach(()=>{if(previous===undefined)delete process.env.ISEMO_LLM_ENABLED;else process.env.ISEMO_LLM_ENABLED=previous})
 it('returns 503 rather than a fake narrative when no private LLM exists',async()=>{
  delete process.env.ISEMO_LLM_ENABLED
  const t=makeApp()
  try{
   const status=await t.api.get('/api/insights/status')
   expect(status.status).toBe(200)
   expect(status.body.enabled).toBe(false)
   const result=await t.api.post('/api/calls/CALL-9999/insights')
   expect(result.status).toBe(503)
   expect(result.body.error).toMatch(/LLM/)
  }finally{t.cleanup()}
 })
})
