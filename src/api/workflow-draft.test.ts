import { describe, expect, it } from 'vitest'
import { parseWorkflowDraft, persistWorkflowDraft, workflowDraftKey, type WorkflowDraft } from '../lib/workflowDraft'

const draft = (baseVersion: number, reason = 'Keep this note'): WorkflowDraft => ({ baseVersion, fields: {
  externalContactId: '', ticketId: '', queueName: '', reason, resolution: 'open',
  nextAction: '', owner: '', followUpAt: null, outcomeNote: '', reviewerName: 'QA',
} })
const memory = () => {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('workflow draft preservation', () => {
  it('preserves an unresolved old version when a newer form tries to persist', () => {
    const storage = memory()
    persistWorkflowDraft(storage, 'CALL-1', draft(1))
    expect(persistWorkflowDraft(storage, 'CALL-1', draft(2, 'New form'))).toBe(false)
    expect(parseWorkflowDraft(storage.getItem(workflowDraftKey('CALL-1')))).toEqual(draft(1))
  })

  it('updates the same-version draft without changing a different call', () => {
    const storage = memory()
    persistWorkflowDraft(storage, 'CALL-1', draft(1))
    persistWorkflowDraft(storage, 'CALL-2', draft(2))
    expect(persistWorkflowDraft(storage, 'CALL-1', draft(1, 'Further edit'))).toBe(true)
    expect(parseWorkflowDraft(storage.getItem(workflowDraftKey('CALL-1')))).toEqual(draft(1, 'Further edit'))
    expect(parseWorkflowDraft(storage.getItem(workflowDraftKey('CALL-2')))).toEqual(draft(2))
  })

  it('rejects malformed drafts and prototype keys as resolution values', () => {
    expect(parseWorkflowDraft('{broken')).toBeNull()
    expect(parseWorkflowDraft(JSON.stringify({ ...draft(0), baseVersion: -1 }))).toBeNull()
    for (const resolution of ['toString', '__proto__', 'unknown']) {
      expect(parseWorkflowDraft(JSON.stringify({ ...draft(0), fields: { ...draft(0).fields, resolution } }))).toBeNull()
    }
    expect(parseWorkflowDraft(JSON.stringify(draft(0)))).toEqual(draft(0))
  })
})
