/** Anonymous speech-cluster evidence is NOT an agent/customer role.
 * Return a hint only with sufficient exclusive overlap. Ambiguous segments
 * are left mixed, because PhoWhisper's coarse windows can cross many turns.
 */
export interface SpeakerTurn {
  start: number
  end: number
  speakerId: 'A' | 'B'
}

export type SpeakerHint = 'A' | 'B' | 'mixed' | 'none'
export function speakerHintForInterval(start:number,end:number,turns:readonly SpeakerTurn[]):SpeakerHint {
  if (!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 'none'
  const coverage:Record<'A'|'B',number>={A:0,B:0}
  for (const turn of turns) {
    if (!Number.isFinite(turn.start)||!Number.isFinite(turn.end)||turn.end<=turn.start)continue
    if(turn.speakerId!=='A'&&turn.speakerId!=='B')continue
    coverage[turn.speakerId]+=Math.max(0,Math.min(end,turn.end)-Math.max(start,turn.start))
  }
  const sum=coverage.A+coverage.B
  if(sum<0.5)return 'none'
  // Evidence needs majority of actual speech *and* a meaningful share of
  // the segment. 12-second ASR windows often contain multiple speakers.
  const winner=coverage.A>=coverage.B?'A':'B'
  const other=winner==='A'?'B':'A'
  if(coverage[winner]/sum>=0.80 && coverage[winner]/(end-start)>=0.35 && coverage[other]<0.5)return winner
  return 'mixed'
}
