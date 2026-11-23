import { describe, expect, it } from 'vitest'
import { batchProgress, validateBatchFiles, MAX_BATCH_FILES, MAX_AUDIO_BYTES, MAX_BATCH_BYTES } from '../src/lib/batch-scan'

const sound = (name: string, size = 1024) => ({ name, size })

describe('Audio batch scan safeguards', () => {
  it('requires actual audio and refuses oversized or too many inputs', () => {
    expect(validateBatchFiles([])).toMatch(/ít nhất/)
    expect(validateBatchFiles([sound('not-audio.pdf')])).toMatch(/WAV/)
    expect(validateBatchFiles([sound('empty.wav', 0)])).toMatch(/trống/)
    expect(validateBatchFiles([sound('too-large.wav', MAX_AUDIO_BYTES + 1)])).toMatch(/300 MB/)
    expect(validateBatchFiles(Array.from({ length: MAX_BATCH_FILES + 1 }, (_, i) => sound(i + '.wav')))).toMatch(/20 file/)
    expect(validateBatchFiles([sound('first.wav', MAX_AUDIO_BYTES), sound('second.wav', MAX_AUDIO_BYTES), sound('third.wav', 1)])).toMatch(/600 MB/)
  })

  it('accepts normal bounded audio batches without checking model readiness here', () => {
    expect(validateBatchFiles([sound('call.wav'), sound('call.mp3'), sound('call.m4a')])).toBeNull()
    expect(MAX_BATCH_BYTES).toBe(600 * 1024 * 1024)
  })

  it('counts only persisted real QA labels, not file uploads or ASR-only jobs', () => {
    expect(batchProgress([
      { id: 'CALL-1', status: 'queued' },
      { id: 'CALL-2', status: 'processing' },
      { id: 'CALL-3', status: 'ready' },
      { id: 'CALL-4', status: 'ready', qaLabel: 'needs_attention' },
      { id: 'CALL-5', status: 'ready', qaLabel: 'routine' },
      { status: 'upload_error' },
    ])).toEqual({ received: 5, analyzed: 2, flagged: 1, failed: 1 })
  })
})
