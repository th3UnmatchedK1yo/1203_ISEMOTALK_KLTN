# Database Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the existing local database safer and explain its actual guarantees and remaining work to the thesis author.

**Architecture:** Retain SQLite and the current HTTP contracts. Centralize additive migrations, share domain predicates between write guards and a read-only checker, and record audio cleanup separately from relational deletion.

**Tech Stack:** TypeScript, Express, better-sqlite3, Vitest; existing React/Vite and Python inference are consumers.

**Spec:** `docs/superpowers/specs/2026-11-23-database-integrity-design.md`

## Global Constraints

- Continue on the existing draft demo-hardening branch.
- Do not migrate an actual user database during development, deploy a public service, purchase hosting, or invent model/evaluation results.
- Preserve existing valid records and identifiers.
- Refuse an invalid legacy migration with an actionable read-only diagnostic; never silently repair or discard data.
- A missing database must not be created.

## Review Focus

- A legacy database with malformed JSON or duplicate utterance order must roll back its entire attempted migration.
- Null/invalid direct SQL writes must fail independently of API validation, including SQL NULL semantics.
- A recording path or symlink outside its owning call directory must never trigger recursive deletion of another directory.
- Filesystem permission failure after relational deletion must remain visible and retryable without a misleading HTTP 500.
- Diagnostic execution on a missing or older database must not silently initialize/migrate it.

### Task 1: Search and workflow history

**Files:** `server/src/repo.ts`, `server/src/workflow.ts`, new `server/tests/db-workflow-history.test.ts`.

**Interfaces:** Keep existing API fields; add event `schemaVersion: 2`, `snapshot`, and `snapshotStatus` without rewriting legacy JSON.

- [x] Reproduce literal-backslash search and lost ticket/queue/reason history; test full snapshots and event-write rollback.
- [x] Escape all LIKE escape/metacharacters and store complete normalized snapshots in the existing workflow transaction.
- [x] Run the focused tests and server typecheck; release shared files for central schema initialization.

### Task 2: Versioned schema and domain enforcement

**Files:** `server/src/db.ts`, new `server/src/db-contract.ts`, `server/src/db-schema.ts`, new `server/tests/db-integrity.test.ts`; remove DDL from `workflow.ts`.

**Interfaces:** `openDb(file: string): DB` stays unchanged. Contract module exports table predicates and `findDataViolations(db): DataViolation[]`. Schema exports the current version, table inventory, and `migrateDatabase(db): void`.

- [x] Add failing direct-write, legacy-preservation, migration-rollback, reopen/idempotence, ordering uniqueness, future-version and foreign-key tests.
- [x] Implement transactionally journaled additive schema installation, NOT NULL keys, shared native/trigger domain guards and unique ordering. Add the agreed cleanup queue schema.
- [x] Run the focused database tests and existing API/workflow tests.

### Task 3: Recording cleanup boundary

**Files:** new `server/src/audio-storage.ts`, DELETE/startup hooks in `server/src/app.ts`, new `server/tests/audio-cleanup.test.ts`.

**Interfaces:** Consume `audio_cleanup_jobs(call_id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT)` without a foreign key. Preserve successful DELETE's 204 contract.

- [x] Reproduce unsafe legacy path, filesystem failure after database commit, and queue-write rollback.
- [x] Validate ownership before deleting; atomically enqueue cleanup with relational deletion; retry once per pending job per invocation/startup.
- [x] Verify missing directories, external links, successful cascade, durable EACCES failure, and startup recovery.

### Task 4: Read-only diagnostic and truthful documentation

**Files:** new `server/src/db-audit.ts`, `server/src/db-check.ts`, `server/tests/db-check.test.ts`, package script; `docs/DATABASE_DESIGN.md`, `docs/audits/database-20261123.md`, `docs/PROJECT_STATUS_20261123.md` and runbook updates.

**Interfaces:** `auditDatabase(file: string, uploadsDir: string): DatabaseAudit`; CLI accepts `--db`, `--uploads`, `--json` and defaults from `ISEMO_DATA_DIR`.

- [x] Test missing database, clean/reopened fixture, legacy corruption, missing recording and pending cleanup; verify read-only behavior.
- [x] Implement independent structural, relational, domain and storage reporting without opening through migration code.
- [x] Write the actual ERD/data dictionary, normalization decisions, atomicity boundaries and stopped-service backup/restore steps.
- [x] Document verified available model/source/Drive assets and request only Windows diagnostics, hardware measurements and genuinely unavailable business data.

### Task 5: Verification and delivery

- [x] Independently review the complete diff, especially migration rollback and filesystem containment; resolve substantive findings.
- [x] Run full Node suite, server typecheck, frontend build and local HTTP smoke; configure the expanded Windows CI gates.
- [x] Commit the verified tree, update the existing draft branch/PR with a lease, and report exact evidence without declaring real SER ready.

Publication and exact-head CI results are tracked in draft PR #6; the implementation and local verification are complete. The first Windows run exposed a CRLF fixture construction issue; LF/CRLF regression variants now pass without changing production behavior, and the published correction is gated again.
