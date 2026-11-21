# Implementation ledger — 2026-11-22

Branch: `feat/thesis-demo-hardening-20261122`. Baseline: PR #5, `9f7ced37d7ddbf253bc7946c111662bc8732e785`. Plan: [thesis demo hardening](superpowers/plans/2026-11-22-thesis-demo-hardening.md).

## Scope and rulings

- User explicitly requested a thorough audit, plan and implementation. Work retained the existing post-call QA direction and stack; no redundant design-permission gate was introduced.
- An isolated checkout and new feature branch were used. Existing user branches, laptop databases, caches and weights were not reset.
- Delivery is a new branch/draft PR against the latest PR5 branch; merging or publishing a public application is not authorized or performed.
- Research, backend and frontend audits were delegated with separate file ownership. Root implemented independent workflow, research page, runbook, integration coordination and final checks. A fresh read-only reviewer checked the whole branch without implementation history.
- The nine historical H5 heads were verified outside the web repository. No raw datasets, recording, private transcript, weights, environment credentials or backups are included in the code change.

## Implemented checkpoints

1. Backend: persistent call-ID allocator; cancellation and late-result guards; atomic output+stage persistence; graceful drain; strict response/import validation; original inputs and stale semantics; supplied roles; evidence-aware moments; coverage; origin gate; complete exports.
2. Inference: bounded decoding/PCM; serialized cold cache misses; finite intervals/probabilities; exact utterance slicing; offline ASR initialization; anonymous roles remain unassigned; artifact-bound verification and four-class manifest validation.
3. Frontend: keyed/abortable loads, serialized polling, sparse versioned drafts, save locks, linear save-diff construction, isolated audio progress, corrected moment selection, clear source/coverage, readable badges and bounded detailed import errors.
4. Workflow: independent version/resource and additive tables; follow-up/resolution validation; atomic history; stale-write409; draft reconciliation; full JSON history with a50-event interactive limit.
5. Operating and thesis material: research crosswalk page; project README; audit/roadmap; Windows runbook and5–7minute narrative; portable venv launcher; readiness/warmup CLI; CI lightweight Python requirements plus FFmpeg.

## Fresh final verification

| Check | Result | What it establishes |
|---|---|---|
| `npm test` | **123/123 passed**,12files | API/domain/SQLite and frontend helper regressions |
| `npm run typecheck:server` | PASS | Backend TypeScript contracts |
| `npm run build` | PASS | Frontend TypeScript and production bundling |
| Python unittest discovery | **34/34 passed** | Lightweight HTTP/audio/adapter/package verification tests |
| `git diff --check` | PASS | Patch whitespace validation |
| Actual HTTP integration | **14/14 passed** | Real Node+Python+preview processes, synthetic fixtures and mock ML |
| Independent source review | Three Important findings fixed; no outstanding Critical/Important | Additional race/draft/moment risks rechecked independently |

Environment: Linux shared runtime, Node24.22.3, Python3.12.14. Project CI targets Node22/Python3.11; CI results are reported by the draft PR rather than inferred from this local run. Actual native `better-sqlite3` binding was installed and used. An early native-binding setup failure was resolved; no SQLite diagnostic replacement was used for final success claims.

Meaningful red/green regressions included deleted-ID late results, atomic checkpoint rollback, malformed inputs, old-input predictions, unknown-role handling, draft/version conflicts, transition-moment selection, weight replacement during load and full-history export. Intermediate concurrent runs briefly observed intentionally failing new regressions; final numbers above supersede those snapshots.

Actual HTTP checks started all processes in one execution session/network namespace with a fresh temporary DB. A30-second generated WAV passed real FFprobe/FFmpeg, mock ASR/SER and persisted stage evidence; Range returned206 with exact bytes. Review and workflow conflicts, follow-up closure, CSV safety, full53-event JSON export versus panel50, coverage, hostile-origin rejection, preview proxy, preflight exit codes and an actual API restart all passed. All test subprocesses terminated. Original report was read and a sanitized evidence record saved in [verification-20261122.json](audits/verification-20261122.json).

For30 warmed sequential keep-alive loopback list requests against3 synthetic calls, p50=1.344ms and p95=2.179ms in this shared Linux runtime. These are **API fixture observations**, not laptop speed, browser responsiveness, production scale or ML throughput. No inference speedup is asserted from them.

## Review resolutions

- Weights could be replaced after full validation but before trusted fingerprint capture. Fingerprint now brackets validation and loading; independent reproduction rejects replacement with loaded/verified false.
- Old workflow draft could be overwritten while reconciling a newer server version. Edits/save/persistence now block until explicit discard; cross-version storage writes reject and retain old note.
- Escalation/recovery played current audio while selecting prior text for QA. Selection now follows the actual moment anchor; tied starts and sustained runs have focused regressions.
- Additional review suggestions addressed: import row details visible; workflow storage warning/download/link guard; source wording for diarization none.

## Decisions retained

- One local background worker; no new broker or real-time telephony. Node cancellation prevents late writes but does not promise interrupting a running Python kernel.
- PCM budget256MiB bounds retained decoded data, not total process RSS. Large compressed recordings can hit this before the3hour metadata cap.
- Keep existing faster-whisper CPU INT8 semantics, set explicit4-thread budget, load cached weights only. Warmup is initialization, not transcription benchmark.
- Verification hashes declared source/config/assets and evaluation evidence before load; loaded package identity checks avoid repeated full backbone hashing. Package dependencies must be fully declared.
- No surrounding-speech padding is silently added by web serving; research-specific padding belongs to the authentic factory.
- F4 only returns fused classification unless separate real heads exist. UI must not fabricate modality outputs.
- Overall mock provenance remains mock even when ASR is real. Component evidence explains the mixture.

## Open acceptance gates

1. **Rendered browser/native audio acceptance:** browser launch/local preview access was blocked in this environment. No screenshots, narrow-screen render, actual seek/listening, or interactive two-tab pass is claimed. The laptop checklist remains open.
2. **Genuine SER restoration:** head hashes confirmed, but full encoders/tokenizer/factory/feature parity, appropriate lineage and real held-out evaluation remain required. No new training or research metric reproduced here.
3. **Per-run model digest:** stage evidence currently stores adapter/model/device/mock/verified. Persist package/config digest before accepting real SER so different seeds/factories can be traced unambiguously.
4. **Laptop timing/resources:** measure real ASR cold/warm, full SER latency and memory on the Windows RTX3050Laptop4GB environment. Historical free disk reports are not fresh measurements.
5. **Browser storage unavailable:** warning/download and link guard exist; browser Back/Forward is not fully blocked. Save server-side before leaving in that degraded mode.
6. **Production extension:** authenticated reviewers, retention, multi-user concurrency, PBX/CRM integration and domain evaluation are subsequent gates, not delivered production capabilities.

The full intent is to make the thesis defendable and the demo repeatable; these open gates are part of the handoff rather than hidden by green unit tests.
