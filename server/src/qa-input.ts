// Stable, reviewer-visible QA input contract used both when predicting and
// displaying whether a stored prediction is still valid after text edits.
import { createHash } from 'node:crypto'

export interface QaInputTurn { text: string; speaker: string }

export function buildQaInput(utterances: QaInputTurn[]): { text: string; hash: string } {
  const text = utterances.length === 1 && utterances[0].speaker === 'unknown'
    ? utterances[0].text.trim()
    : utterances.map(u => u.speaker + ': ' + u.text).join('\n').trim()
  return { text, hash: createHash('sha256').update(text).digest('hex') }
}
