# Thesis demo hardening implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Root coordinates independent file ownership and one whole-branch review.

**Goal:** Deliver a reliable, explainable post-call SER review workflow with authentic source labeling, retained reviewer work and operational follow-up.

**Architecture:** Retain React/Vite, Express/SQLite and local FastAPI. Inference stays a background job; workflow edits and review edits have separate optimistic versions. Runtime optimizations preserve model semantics.

**Tech Stack:** TypeScript, React 18, Express 5, SQLite, Python/FastAPI, existing faster-whisper CPU runtime.

**Spec:** `docs/superpowers/specs/2026-11-22-thesis-demo-design.md`

## Global constraints

- Start at PR #5 `9f7ced37`; work on `feat/thesis-demo-hardening-20261122`.
- No reset/deletion of existing user data, weights, caches, or branches. New migrations must be additive.
- No fake research outputs; F1/B2/F4 remain distinct; missing unimodal heads stay unavailable.
- Four emotion labels only: neutral, happy, sad, angry. Seconds for segment timestamps; ISO UTC for persisted dates.
- Public repository must contain no recordings, private transcripts, model weights or secrets.
- Native test/runtime failure must be reported, not worked around by silently changing production dependencies.

## Review focus

1. A delayed result arrives after a call was deleted or route changed: ignore it without mutating another call.
2. A reviewer changes text/speaker while old predictions remain: expose original inputs and stale semantics.
3. A user switches upload tabs or leaves mid-edit: no hidden attachment leak or silent draft loss.
4. A model package changes after verification: verification must no longer pass for that package.
5. A follow-up is saved twice from different tabs: reject the stale write; do not lose outcome history.

## Task 1 — backend integrity and evidence

**Owner/files:** backend agent; `server/src/{db,repo,pipeline,inference/client,domain,review,importers,app,index}.ts`, focused `server/tests/*`.

**Interfaces:** preserve existing endpoints; extend stage entries with optional timing/evidence; expose original text/speaker and input staleness on utterances. Coordinate exact DTO with frontend before changing it.

- [x] Reproduce ID reuse/late async mutation, malformed import, metadata orphan and note-only status defects with regression tests.
- [x] Add persistent allocator and cancellation/draining guards; validate service responses at the boundary.
- [x] Preserve supplied speaker labels and component provenance; retain original prediction inputs.
- [x] Make create/import cleanup atomic and validate integer pagination. Keep existing optimistic review writes.
- [x] Run backend typecheck and Node suite; document any remaining risks and files modified.

## Task 2 — inference verification and bounded resource use

**Owner/files:** inference agent; `inference/app/*`, `inference/tests/*`, inference-specific docs/scripts only by coordination.

**Interfaces:** existing HTTP routes remain; additive evidence may contain adapter/model/device/verified fields. Do not emit nonexistent acoustic/lexical outputs. Warmup cannot download weights.

- [x] Write regressions for invalid evaluation manifests/thresholds, modified weight artifacts and duplicate decode/resource behavior.
- [x] Bind verification to explicit artifact identities, factory and manifest; validate evaluation class coverage and finite numbers.
- [x] Improve bounded decode cache/stereo computation; provide offline ASR warmup/readiness with clear configured versus loaded semantics if compatible.
- [x] Run lightweight Python suite; describe model equivalence restoration gates from actual research source.

## Task 3 — frontend reliability and review readability

**Owner/files:** frontend agent; active pages except ResearchPage, `src/api/isemotalk.ts`, new review helpers/components/tests, `src/index.css`. Root owns AppShell/App.tsx and CallWorkflowPanel.

**Interfaces:** export `apiJson`; `CallWorkflowPanel({callId})` independent request/version. Backend publishes optional provenance/stale-input additions; old data still render.

- [x] Add meaningful tests for draft version/identity, changed payload and API contracts.
- [x] Guard route requests and serialized polling; prevent in-flight save from losing edits and persist draft safely.
- [x] Correct export origin and hidden upload mode state; validate correction selection.
- [x] Optimize transcript progress updates and save diff; improve contrast/text size and plain-language copy.
- [x] Run frontend/API tests and build. Browser interactions remain an explicitly open laptop acceptance gate below.

## Task 4 — call workflow resource and panel

**Owner/files:** root; create `server/src/workflow.ts`, `server/tests/workflow.test.ts`, `src/api/workflow.ts`, `src/components/review/CallWorkflowPanel.tsx`; add route installer after backend agent releases app.ts.

**Interfaces:** GET/PUT `/api/calls/:id/workflow`; initial version 0; schema and transition rules in design; independently versioned call_workflows and workflow_events tables.

- [x] Test missing call 404, empty initial workflow, follow-up required fields, resolution note, stale write 409, persisted history and deletion cascade.
- [x] Implement atomic validated writes and route attachment.
- [x] Build accessible form with explicit save/error/dirty state, local datetime conversion, outcome/history view and no invented contacts.
- [x] Verify workflow and SER review versions do not overwrite each other.

## Task 5 — research explanation and operating documentation

**Owner/files:** root; `src/pages/ResearchPage.tsx`, App.tsx/AppShell.tsx, README, `docs/THESIS_AUDIT_20261122.md`, `docs/DEMO_RUNBOOK.md`, small portable preflight script if useful, CI workflow.

- [x] Map each paper endpoint to a UI/data decision and a statement the student can defend.
- [x] Write prioritized restoration/evaluation roadmap and realistic contact-center workflow.
- [x] Add a small runtime readiness check that reports component status and measured request latency without asserting accuracy.
- [x] Document Windows startup, cold/warm distinction, export/recovery, known mock limits and a measured demo acceptance checklist.

## Task 6 — integration, independent review and delivery

- [x] Run full build, server typecheck, Node and Python suites; inspect output.
- [x] Launch actual API + inference (mock fixtures explicitly labeled) + production frontend; verify real HTTP routes, assets, proxy and persisted workflow.
- [ ] Inspect desktop/narrow browser screenshots and native audio interactions. BLOCKED in this environment by browser launch/local preview access restrictions; see laptop checklist.
- [x] Exercise import → processed call → audio Range transport → review → business follow-up → reload/export; measure small-fixture API reads with conditions. Browser seek is not claimed tested.
- [x] Independent whole-branch review, resolve important findings with regression evidence.
- [ ] Deliver verified changes on a new remote branch and draft PR; leave merging to the user. Remote delivery is recorded by the PR URL, separately from these pre-commit checks.

## Final verification checkpoint

Node123/123, Python34/34, build and backend typecheck passed. Actual HTTP integration14/14 passed using explicit mock ASR/SER and synthetic audio, including restart persistence. Independent review resolved three Important findings. Browser acceptance and genuine model restoration are open; they are not relabeled as completed by passing software tests.
