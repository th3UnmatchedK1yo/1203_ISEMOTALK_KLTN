import { describe, it, expect } from 'vitest'
import { speakerHintForInterval } from '../src/lib/speaker-evidence'

describe('anonymous speaker time evidence',()=>{
  it('identifies an unambiguous voice but never an agent/customer role',()=>{
    expect(speakerHintForInterval(0,3,[{start:0,end:3,speakerId:'A'}])).toBe('A')
    expect(speakerHintForInterval(5,8,[{start:5,end:8,speakerId:'B'}])).toBe('B')
  })
  it('abstains from mixed or mostly silent ASR windows',()=>{
    const turns=[{start:0,end:3,speakerId:'A' as const},{start:3,end:6,speakerId:'B' as const}]
    expect(speakerHintForInterval(0,6,turns)).toBe('mixed')
    expect(speakerHintForInterval(0,12,turns)).toBe('mixed')
    expect(speakerHintForInterval(9,12,turns)).toBe('none')
  })
  it('never accepts invalid windows',()=>{
    expect(speakerHintForInterval(5,3,[{start:0,end:10,speakerId:'A'}])).toBe('none')
    expect(speakerHintForInterval(NaN,3,[])).toBe('none')
  })
})
