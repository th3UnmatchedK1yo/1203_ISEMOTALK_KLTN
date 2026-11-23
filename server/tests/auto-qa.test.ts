import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '../src/db'
import { loadConfig } from '../src/config'
import { AutoQa } from '../src/auto-qa'
import * as repo from '../src/repo'

const instances: Array<ReturnType<typeof openDb>> = []
afterEach(() => { vi.unstubAllGlobals(); instances.splice(0).forEach(db => db.close()) })

function add(db: ReturnType<typeof openDb>, id: string, title: string, text: string, provenance: 'imported'|'real'='imported') {
  repo.insertCall(db, {
    id,title,agentName:'',customerName:'',callDate:new Date().toISOString(),
    source:'transcript_import',agentChannel:0,provenance,stageLog:[],
  })
  repo.replaceUtterances(db,id,[{speaker:'unknown',text,start:0,end:20}])
  repo.updateCall(db,id,{status:'ready'})
}

describe('Automatic real QA pipeline', () => {
  it('backs up the genuine model result without a manual button; never scores unrelated DataHive', async () => {
    const db=openDb(':memory:'); instances.push(db)
    add(db,'CALL-0101','TTS TỔNG HỢP · OneVoice · 01',
        'agent: Em nghe\\ncustomer: Tôi cần hoàn tiền')
    add(db,'CALL-0102','HỘI THOẠI ĐIỆN THOẠI THẬT · DataHive · 01','Tôi muốn nói chuyện')
    const fake=vi.fn(async (url:string) => {
      if(url.endsWith('/v1/qa/health')) return new Response(JSON.stringify({ready:true}),{status:200})
      if(url.endsWith('/v1/qa/triage')) return new Response(JSON.stringify({
        label:'needs_attention',score:.82,model:'xlm-roberta-qa@test',
        modelSha256:'a'.repeat(64),dataset:'synthetic_onevoice',
        truncated:false,source:'model',note:'model'},
      ),{status:200})
      throw Error('Unexpected network call: '+url)
    })
    vi.stubGlobal('fetch',fake)
    const runner=new AutoQa(db,loadConfig(),()=>{})
    await runner.sweep()
    const row=db.prepare('SELECT label,score FROM qa_triage_results WHERE call_id=?').get('CALL-0101')
    expect(row).toEqual({label:'needs_attention',score:.82})
    expect(db.prepare('SELECT COUNT(*) AS n FROM qa_triage_results').get()).toEqual({n:1})
    expect(fake.mock.calls.filter(c=>String(c[0]).includes('/triage'))).toHaveLength(1)
    await runner.stop()
  })
  it('rejects unready QA without creating synthetic predictions', async () => {
    const db=openDb(':memory:'); instances.push(db)
    add(db,'CALL-0201','TTS TỔNG HỢP · OneVoice · 02','agent: Alo\\ncustomer: Help')
    vi.stubGlobal('fetch',vi.fn(async () => new Response(JSON.stringify({ready:false}),{status:200})))
    const runner=new AutoQa(db,loadConfig(),()=>{})
    await runner.sweep()
    expect(db.prepare('SELECT COUNT(*) AS n FROM qa_triage_results').get()).toEqual({n:0})
    await runner.stop()
  })
})
