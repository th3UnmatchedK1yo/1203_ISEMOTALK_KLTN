import type { WorkflowFields } from '@/api/workflow'

export interface WorkflowDraft { baseVersion: number; fields: WorkflowFields }
export const workflowDraftKey = (id: string) => `isemotalk:workflow-draft:v1:${id}`

export function parseWorkflowDraft(raw: string | null): WorkflowDraft | null {
  try {
    const v = JSON.parse(raw ?? 'null') as WorkflowDraft | null
    if (!v || !Number.isInteger(v.baseVersion) || v.baseVersion < 0 || !v.fields) return null
    const f = v.fields
    if (!['unassessed', 'open', 'follow_up', 'resolved'].includes(f.resolution)) return null
    const keys = ['externalContactId', 'ticketId', 'queueName', 'reason', 'nextAction', 'owner', 'outcomeNote', 'reviewerName'] as const
    if (!keys.every(k => typeof f[k] === 'string') || (f.followUpAt !== null && (typeof f.followUpAt !== 'string' || !Number.isFinite(Date.parse(f.followUpAt))))) return null
    return v
  } catch { return null }
}

export function persistWorkflowDraft(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string, draft: WorkflowDraft): boolean {
  const existing = parseWorkflowDraft(storage.getItem(workflowDraftKey(id)))
  // A draft from another saved version is recoverable user work, not a cache entry.
  // Only an explicit discard action may remove it before a new version is edited.
  if (existing && existing.baseVersion !== draft.baseVersion) return false
  storage.setItem(workflowDraftKey(id), JSON.stringify(draft))
  return true
}
