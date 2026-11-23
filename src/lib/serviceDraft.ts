export type DraftFields = Record<string, string | boolean>
export interface ServiceDraft<T extends DraftFields> { baseVersion: number; values: T }

/** Accept known fields with the expected primitive types; never merge unknown storage keys. */
export function parseServiceDraft<T extends DraftFields>(raw: string | null, initial: T): ServiceDraft<T> | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Record<string, unknown>
    if (!Number.isSafeInteger(candidate.baseVersion) || (candidate.baseVersion as number) < 0 || !candidate.values || typeof candidate.values !== 'object') return null
    const values = candidate.values as Record<string, unknown>
    const known: Record<string, string | boolean> = {}
    for (const [key, defaultValue] of Object.entries(initial)) {
      if (typeof values[key] !== typeof defaultValue || (typeof values[key] === 'string' && (values[key] as string).length > 6000)) return null
      known[key] = values[key] as string | boolean
    }
    return { baseVersion: candidate.baseVersion as number, values: known as T }
  } catch { return null }
}
