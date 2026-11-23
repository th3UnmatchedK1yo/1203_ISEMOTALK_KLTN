import type { DB } from './db'
import { serviceDataViolations } from './service-audit'
import { SERVICE_TABLES } from './service-schema'

export const DATA_TABLES = ['calls', 'utterances', 'moment_reviews', 'id_counters', 'call_workflows', 'workflow_events', 'audio_cleanup_jobs'] as const
export type DataTable = typeof DATA_TABLES[number]
interface Rule { table: DataTable; name: string; valid: (prefix: string) => string }

const all = (...parts: string[]) => parts.map(p => `(${p})`).join(' AND ')
const textKey = (c: string) => `typeof(${c})='text' AND length(trim(${c}))>0`
const oneOf = (c: string, values: string[]) => `${c} IN (${values.map(v => `'${v}'`).join(',')})`
const optional = (c: string, condition: string) => `(${c} IS NULL OR (${condition}))`
const integer = (c: string, min: number, max?: number) => `typeof(${c})='integer' AND ${c}>=${min}${max == null ? '' : ` AND ${c}<=${max}`}`
const number = (c: string, min = 0, max = '1.7976931348623157e308') => `typeof(${c}) IN ('integer','real') AND ${c}>=${min} AND ${c}<=${max}`
// CASE guards json_type: malformed JSON must become a failed predicate rather
// than an exception while inspecting old data. SQL AND need not short circuit.
const jsonShape = (c: string, shape: 'array' | 'object') => `CASE WHEN json_valid(${c}) THEN json_type(${c})='${shape}' ELSE 0 END`
const emotions = ['neutral', 'happy', 'sad', 'angry']
const speakers = ['agent', 'customer', 'unknown']
const prediction = (e: string, c: string) => `((${e} IS NULL AND ${c} IS NULL) OR (${oneOf(e, emotions)} AND ${number(c, 0, '1')}))`

// Only fixed application-owned identifiers and predicates enter SQL here.
// API validation additionally handles dates, lengths, JSON contents and business
// transitions; these predicates enforce the core persisted value domains.
export const DATA_RULES: readonly Rule[] = [
  { table: 'calls', name: 'identity', valid: p => all(...['id', 'call_date', 'created_at', 'updated_at'].map(c => textKey(p + c))) },
  { table: 'calls', name: 'enums', valid: p => all(
    oneOf(p + 'source', ['upload', 'transcript_import', 'results_import']),
    oneOf(p + 'status', ['queued', 'processing', 'ready', 'failed']),
    oneOf(p + 'priority', ['low', 'medium', 'high']),
    oneOf(p + 'review_status', ['unreviewed', 'in_progress', 'reviewed']),
    optional(p + 'provenance', oneOf(p + 'provenance', ['mock', 'real', 'imported'])),
    optional(p + 'speaker_source', oneOf(p + 'speaker_source', ['channel', 'model', 'provided', 'mock', 'unassigned'])),
    optional(p + 'stage', oneOf(p + 'stage', ['validate', 'transcribe', 'diarize', 'emotion', 'finalize'])),
    optional(p + 'dominant_emotion', oneOf(p + 'dominant_emotion', emotions)),
  ) },
  { table: 'calls', name: 'numeric_ranges', valid: p => all(
    number(p + 'duration'), integer(p + 'progress', 0, 100), integer(p + 'agent_channel', 0, 1),
    optional(p + 'channels', integer(p + 'channels', 1)), integer(p + 'version', 1),
    ...['attempts', 'moment_count', 'escalation_count', 'recovery_count', 'disagreement_count'].map(c => integer(p + c, 0)),
    number(p + 'negative_ratio', 0, '1'), optional(p + 'avg_confidence', number(p + 'avg_confidence', 0, '1')),
  ) },
  { table: 'calls', name: 'json_arrays', valid: p => all(jsonShape(p + 'stage_log', 'array'), optional(p + 'peaks', jsonShape(p + 'peaks', 'array'))) },
  { table: 'utterances', name: 'identity_and_order', valid: p => all(textKey(p + 'call_id'), textKey(p + 'id'), integer(p + 'idx', 0)) },
  { table: 'utterances', name: 'interval', valid: p => all(number(p + 'start'), number(p + 'end'), `${p}end>${p}start`) },
  { table: 'utterances', name: 'roles_and_flag', valid: p => all(oneOf(p + 'speaker', speakers), optional(p + 'orig_speaker', oneOf(p + 'orig_speaker', speakers)), integer(p + 'flagged', 0, 1)) },
  { table: 'utterances', name: 'predictions', valid: p => all(
    ...['ac', 'lx', 'fu'].map(kind => prediction(`${p}${kind}_emotion`, `${p}${kind}_conf`)),
    optional(p + 'agreement', oneOf(p + 'agreement', ['high', 'partial', 'conflict'])),
  ) },
  { table: 'utterances', name: 'review', valid: p => `(
    (${p}review_decision IS NULL AND ${p}review_emotion IS NULL) OR
    (${p}review_decision='confirmed' AND ${p}review_emotion IS NULL AND ${p}fu_emotion IS NOT NULL) OR
    (${p}review_decision='corrected' AND ${oneOf(p + 'review_emotion', emotions)})
  )` },
  { table: 'moment_reviews', name: 'identity_and_relevance', valid: p => all(textKey(p + 'call_id'), textKey(p + 'moment_id'), optional(p + 'relevance', integer(p + 'relevance', 0, 1))) },
  { table: 'id_counters', name: 'identity_and_value', valid: p => all(textKey(p + 'name'), integer(p + 'value', 0)) },
  { table: 'call_workflows', name: 'identity_and_document', valid: p => all(textKey(p + 'call_id'), integer(p + 'version', 1), textKey(p + 'updated_at'), jsonShape(p + 'fields_json', 'object')) },
  { table: 'workflow_events', name: 'identity_and_document', valid: p => all(textKey(p + 'call_id'), integer(p + 'version', 1), textKey(p + 'at'), jsonShape(p + 'event_json', 'object')) },
  { table: 'audio_cleanup_jobs', name: 'identity_and_attempts', valid: p => all(textKey(p + 'call_id'), textKey(p + 'created_at'), integer(p + 'attempts', 0)) },
]

export function tableContract(table: DataTable, prefix = ''): string {
  // COALESCE is essential: a SQLite CHECK accepts NULL, whereas the domain
  // contract must reject an absent value unless the rule explicitly allows it.
  return `COALESCE((${all(...DATA_RULES.filter(r => r.table === table).map(r => r.valid(prefix)))}),0)=1`
}

export interface DataViolation { table: string; rule: string; count: number; sampleRowIds: number[] }

/** Inspect existing rows without changing them. Missing columns remain a schema error for the caller. */
export function findDataViolations(db: DB): DataViolation[] {
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(t => t.name))
  const results: DataViolation[] = []
  for (const rule of DATA_RULES) {
    if (!tables.has(rule.table)) continue
    const where = `COALESCE((${rule.valid('')}),0)<>1`
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${rule.table} WHERE ${where}`).get() as { n: number }
    if (n) results.push({ table: rule.table, rule: rule.name, count: n,
      sampleRowIds: (db.prepare(`SELECT rowid AS id FROM ${rule.table} WHERE ${where} LIMIT 10`).all() as Array<{ id: number }>).map(r => r.id) })
  }
  if (tables.has('utterances')) {
    const duplicates = db.prepare('SELECT MIN(rowid) AS id, COUNT(*) AS n FROM utterances GROUP BY call_id,idx HAVING COUNT(*)>1').all() as Array<{ id: number; n: number }>
    if (duplicates.length) results.push({ table: 'utterances', rule: 'unique_call_order', count: duplicates.length, sampleRowIds: duplicates.slice(0, 10).map(r => r.id) })
  }
  if (SERVICE_TABLES.every(table => tables.has(table))) results.push(...serviceDataViolations(db))
  return results
}
