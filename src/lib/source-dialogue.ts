/** Read OneVoice script turns for display ONLY.
 * Does not invent time alignment or replace the source transcript/model input.
 */
export type SourceTurn = { speaker: 'agent' | 'customer' | 'unknown'; text: string }

export function sourceDialogueTurns(text: string): SourceTurn[] {
  const lines = text.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').split(/\n+/)
  const result: SourceTurn[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const tagged = /^(agent|customer)\s*:\s*(.*)$/i.exec(line)
    if (tagged) {
      result.push({ speaker: tagged[1].toLowerCase() as 'agent' | 'customer', text: tagged[2].trim() })
    } else if (result.length > 0) {
      // Continuation line, not evidence for a new speaker.
      result[result.length - 1].text += ' ' + line
    } else {
      result.push({ speaker: 'unknown', text: line })
    }
  }
  return result.filter(turn => turn.text.length > 0)
}
