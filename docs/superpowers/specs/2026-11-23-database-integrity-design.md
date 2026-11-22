# Database integrity and project handoff

## Goal and authorization

The user requested a careful database review, completion of necessary fixes, an honest implementation status, and a concrete list of work requiring their Windows machine. Continue on the existing draft demo-hardening branch. Do not migrate an actual user database during development, deploy a public service, purchase hosting, or invent model/evaluation results.

## Current evidence

The application uses Express/TypeScript, better-sqlite3 and a local Python inference service. Existing API validation, foreign keys, transactions, pipeline checkpoints and optimistic versions are useful foundations. Reproduced gaps are literal backslash search, incomplete workflow event snapshots, missing database-level domain checks, unsafe deletion of a legacy recording path, and a filesystem error reported after a successful database deletion. Structural `integrity_check` alone does not establish application data validity.

## Selected design

1. Keep the current local SQLite architecture. Centralize all schema initialization in `openDb`; introduce a transactionally recorded migration. Preserve existing valid records and identifiers. Refuse an invalid legacy migration with an actionable read-only diagnostic; never silently repair or discard data.
2. Use one shared SQL domain contract for native checks on new tables, additive INSERT/UPDATE guards on existing tables, and the diagnostic. Add unique `(call_id, idx)` ordering. Do not rebuild legacy tables just to add CHECK clauses. Foreign keys remain enabled for every application connection.
3. Preserve workflow JSON as a documented local-app tradeoff. New history events carry the complete normalized form snapshot. Old partial history remains unchanged and explicitly labeled. Current workflow plus its event commit together.
4. Use a small durable `audio_cleanup_jobs` table for the database/filesystem boundary. Validate that a recording belongs to the call before deletion. Delete relational rows and enqueue cleanup in one transaction, then attempt filesystem cleanup. A failed cleanup stays visible and retryable on application startup. This is not a cross-resource ACID transaction.
5. Provide `npm run db:check` as a read-only diagnostic: schema/version, structural integrity, foreign keys, semantic domain checks, duplicate order, pending cleanup and recording availability. Report identifiers/counts, not transcript/customer content. A missing database must not be created.
6. Document the exact ERD, data dictionary, key choices, denormalized fields, JSON limits, transactions, indexes, backup/restore procedure and production gaps. Keep model claims separate from application tests.

## Alternatives and boundaries

A full relational CRM/auth/model-registry redesign or PostgreSQL/Rust migration adds unvalidated scope. Only documenting defects leaves reproduced failures in the product. Additive migrations and targeted fixes give a reviewable improvement without destroying existing data. The local API is still intended for one host; no claim of multi-tenant authentication, immutable compliance audit, distributed jobs, or call-center model accuracy is made.

## Acceptance

- Fresh databases and valid legacy fixtures preserve relationships and survive reopen without repeated migrations.
- Invalid legacy fixtures fail migration atomically; direct invalid INSERT/UPDATE statements are rejected on both new and migrated schemas.
- Workflow event insertion failure rolls back the current form/version; literal `\\`, `%`, and `_` searches work.
- Invalid deletion paths preserve all records/files; filesystem failure leaves a durable cleanup job, and retry clears it safely.
- Diagnostic opens read-only, detects structural/referential/domain/storage failures separately, and does not create a missing database.
- Full existing Node tests, server typecheck, production frontend build, and relevant Windows CI pass before publishing the updated draft branch. Record exact results and remaining hardware/model limits.
