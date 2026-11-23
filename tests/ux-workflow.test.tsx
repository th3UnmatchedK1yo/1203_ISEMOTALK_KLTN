import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { GuidePage } from '../src/pages/GuidePage'
import { TranscriptList } from '../src/components/review/TranscriptList'
import type { Utterance } from '../src/api/isemotalk'

const u: Utterance = {
  id:'U-1',idx:0,speaker:'unknown',text:'Tôi cần hỗ trợ đăng nhập',
  start:0,end:12,acoustic:null,lexical:null,fused:null,agreement:null,
  review:{decision:null,emotion:null,note:''},flagged:false,textEdited:false,speakerEdited:false,
}

describe('QA workflow explains real versus unavailable model output', () => {
  it('has a readable guide with all actual user actions and separates technical pages', () => {
    const html=renderToStaticMarkup(<MemoryRouter><GuidePage/></MemoryRouter>)
    expect(html).toContain('Gửi ghi âm cho AI')
    expect(html).toContain('QA đánh giá, rồi xử lý')
    expect(html).toContain('Nhập dữ liệu nâng cao')
    expect(html).toContain('Mô hình và giới hạn')
    expect(html).toContain('Chưa có đầu ra F4')
    expect(html).toContain('href="/scan"')
  })
  it('renders unassigned ASR segments as neutral time-coded text, not fake agent chat', () => {
    const html=renderToStaticMarkup(<TranscriptList utterances={[u]} patches={{}} selectedId={null}
      activeId={null} onSelect={()=>{}} transcriptFromAudio timingMode="audio_window"/>)
    expect(html).toContain('Bản phiên âm theo thời gian')
    expect(html).toContain('Đoạn âm thanh · chưa xác định người nói')
    expect(html).toContain('cửa sổ audio')
    expect(html).not.toContain('Khách hàng (nhãn kịch bản)')
    expect(html).not.toContain('Nhân viên (nhãn kịch bản)')
  })
})
