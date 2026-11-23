import { describe, expect, it } from 'vitest'
import { sourceDialogueTurns } from '../../src/lib/source-dialogue'

describe('OneVoice transcript display, without fabricated timestamps', () => {
  it('formats literal backslash-n agent/customer turns', () => {
    const dialogue = sourceDialogueTurns('agent: Xin chào\\ncustomer: Tôi không vào được\\nagent: Bạn thử đặt lại mật khẩu')
    expect(dialogue).toEqual([
      {speaker: 'agent', text: 'Xin chào'},
      {speaker: 'customer', text: 'Tôi không vào được'},
      {speaker: 'agent', text: 'Bạn thử đặt lại mật khẩu'},
    ])
  })
  it('handles real newlines and continuation without inventing a speaker', () => {
    expect(sourceDialogueTurns('Không có nhãn\nVẫn là câu này\ncustomer: Có ai hỗ trợ không?')).toEqual([
      {speaker:'unknown',text:'Không có nhãn Vẫn là câu này'},
      {speaker:'customer',text:'Có ai hỗ trợ không?'},
    ])
  })
})
