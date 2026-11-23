import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db'
import * as repo from '../src/repo'
import { buildQaInput } from '../src/qa-input'
import { buildAnalytics } from '../src/reports'

describe('XLM-R QA screening coverage dashboard', () => {
  it('counts eligible real/OneVoice transcripts, excludes DataHive, and detects stale QA independently of SER', () => {
    const db = openDb(':memory:')
    try {
      const insert = (id: string, title: string, provenance: 'real' | 'imported') => {
        repo.insertCall(db, { id, title, provenance,
          agentName: '', customerName: '', callDate: '2026-11-23T12:00:00.000Z',
          source: 'results_import', agentChannel: 0, stageLog: [] })
        repo.replaceUtterances(db, id, [{ speaker: 'unknown', text: 'agent: Em nghe\\ncustomer: Xin hỗ trợ hoàn tiền', start: 0, end: 20 }])
        repo.updateCall(db, id, { status: 'ready' })
      }
      insert('CALL-000001', 'TTS TỔNG HỢP · OneVoice · 01', 'imported')
      insert('CALL-000002', 'TTS TỔNG HỢP · OneVoice · 02', 'imported')
      insert('CALL-000003', 'HỘI THOẠI ĐIỆN THOẠI THẬT · DataHive · 01', 'imported')
      insert('CALL-000004', 'TTS TỔNG HỢP · OneVoice · 03', 'imported')
      insert('CALL-000005', 'Ghi âm cuộc gọi mới đã qua ASR', 'real')
      const insertQa = db.prepare('INSERT INTO qa_triage_results (call_id,input_sha256,model_sha256,model_name,label,score,dataset_source,truncated,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      const write = (id: string, label: 'needs_attention' | 'routine', score: number, input: string) =>
        insertQa.run(id, input, 'a'.repeat(64), 'xlm-roberta-qa@v2/window-max-v2', label, score,
          'synthetic_onevoice', 0, '2026-11-23T12:00:00.000Z')
      const sha = (id: string) => buildQaInput(repo.getUtterances(db, id)).hash
      write('CALL-000001','needs_attention',.92,sha('CALL-000001'))
      write('CALL-000004','routine',.17,'b'.repeat(64))
      write('CALL-000005','routine',.22,sha('CALL-000005'))
      const all = buildAnalytics(db,{})
      expect(all.qaTriage).toEqual({eligible:4,scored:2,needsAttention:1,routine:1,waiting:1,needsRerun:1})
      expect(all.coverage.callsWithCustomerEmotion).toBe(0)
      expect(buildAnalytics(db,{provenance:'real'}).qaTriage).toEqual(
        {eligible:1,scored:1,needsAttention:0,routine:1,waiting:0,needsRerun:0})
      db.prepare('UPDATE utterances SET text=? WHERE call_id=?')
        .run('customer: Xin hỗ trợ thêm vì chưa được hoàn tiền', 'CALL-000001')
      expect(buildAnalytics(db,{}).qaTriage).toEqual(
        {eligible:4,scored:1,needsAttention:0,routine:1,waiting:1,needsRerun:2})
    } finally {
      db.close()
    }
  })
})
