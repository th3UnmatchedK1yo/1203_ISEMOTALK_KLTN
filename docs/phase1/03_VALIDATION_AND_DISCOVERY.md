# Phase 1 — Acceptance, validation and discovery plan

Status: desk research and product specification complete as a draft; no stakeholder interviews, production pilot, GPU benchmarks or model retraining performed in this phase. This is a design gate, not proof of release readiness.

## 1. Traceable scenario matrix

Each AC is a planned test. P0 = blocks pilot release; P1 = important. Use consented/synthetic non-sensitive fixtures; no invented measured outcomes. Persist test evidence, actual/expected, model/rule version, status. For tests requiring model quality, use labeled fixtures; deterministic mock is permitted only for plumbing and explicitly tagged.

| ID | Priority | Given / scenario | Expected outcome |
|---|---|---|---|
| AC01 | P0 | Multiple valid WAV/MP3/M4A | Each gets durable job ID, individual status, batch counts; no user model selection |
| AC02 | P0 | Same file/external ID submitted twice, including network retry | Detect same source/checksum; idempotent retry or explicit new version, no duplicate case |
| AC03 | P0 | Corrupt/unsupported file | Reject that item; valid siblings proceed; actionable error |
| AC04 | P0 | Missing optional metadata | Accept recording, mark fields unknown; do not fabricate identity/time |
| AC05 | P0 | Missing permission declaration or upload access | Block processing and show required permission |
| AC06 | P0 | Batch interruption/browser closed | Server persists accepted jobs; resume list; unaccepted items distinguishable |
| AC07 | P0 | Restart while worker running | Recover/retry stage safely; no duplicated published output |
| AC08 | P0 | ASR succeeds, SER fails | Preserve transcript and provenance, partial status; retry SER alone if input unchanged |
| AC09 | P0 | 8 kHz telephone mono | Normalize for model without inventing channel/role; offsets refer to original duration |
| AC10 | P0 | Verified stereo, agent on right | Correct speaker attribution and same audio channel slice for ASR/SER |
| AC11 | P0 | Mono, two voices | Anonymous speaker clusters or unknown; no automatic customer identity |
| AC12 | P0 | Transfer/conference, three speakers | Distinct clusters if possible; unmapped roles unknown; no fabricated two-person mapping |
| AC13 | P0 | Overlap, music/IVR, silence | Mark/skip unsuitable segments; no artificial neutral classification |
| AC14 | P0 | Loud background noise or clipping | Quality flags, limited coverage/abstain; no angry label based solely on volume |
| AC15 | P1 | Code-switch, dialect, names/number errors | Quality/unsupported language flags; preserve raw and corrected transcript |
| AC16 | P0 | Click transcript, alert and timeline | Seek original audio within stated timestamp precision; visibly mark coarse alignment |
| AC17 | P0 | Missing audio or truncated recording | Show unavailable evidence; not assessable, no fake waveform/player |
| AC18 | P0 | Fusion head present, unimodal absent | Show fusion only; no disagreement number or fabricated probabilities |
| AC19 | P0 | Audio/text disagree | AI verification finding with both outputs, not “sarcasm proven” |
| AC20 | P0 | Low certainty/OOD/unsupported segment | Abstain or clearly labeled heuristic; don't conflate with negative emotion |
| AC21 | P0 | Unknown roles alternate emotional labels | No inferred customer escalation/recovery; report coverage |
| AC22 | P0 | New model/transcript version | Store separate run; prior AI evidence and human decision retained; stale label clearly marked |
| AC23 | P0 | Calm customer says “tôi muốn hủy đơn” | Business candidate even when SER neutral; human confirms |
| AC24 | P0 | “Tôi không muốn hủy” / quoted cancellation | No affirmative cancellation from isolated keyword; uncertain flagged for manual review |
| AC25 | P0 | Angry customer receives valid solution | Review optional; no automatic negative agent score |
| AC26 | P0 | Polite ending, refund merely promised | Do not close case automatically; unresolved/unknown until outcome evidence |
| AC27 | P0 | Follow-up and SER uncertainty same call | Separate tasks, grouped display, no duplicate call totals |
| AC28 | P1 | No AI findings | Eligible for random audit and manual case; not labeled “perfect” |
| AC29 | P0 | Reprocess same rule/version/event | Dedup tasks; deliberate new ruleset is auditable |
| AC30 | P0 | QA sees partial/truncated call | Not assessable when evidence missing; no zero score for unknown |
| AC31 | P0 | Two reviewers edit concurrently | Conflict/version check; no silent overwrite, draft recoverable |
| AC32 | P0 | Reviewer submits and refreshes | Persist review and evidence; version/status correct; audit event |
| AC33 | P1 | QA disputes existing evaluation | Supervisor reopen/adjudicate; preserve old decision/history |
| AC34 | P0 | Correct label/text/role after model run | Preserve original, explicit reanalysis option, downstream evidence versioned |
| AC35 | P0 | Reviewer confirms callback | Case owner, due, action required; linked to evidence |
| AC36 | P0 | Deadline passes before case closed | Overdue visible; no fake resolution or promise of external notification |
| AC37 | P0 | Actual outcome unknown/confirmed later | Status explicit, evidence required to close; reopen audit |
| AC38 | P0 | Search/filter large history | Server-side pagination/filter, predictable sort, no stale selection |
| AC39 | P0 | Imported/mock/synthetic/real mixed | Separate provenance filters; default scientific metrics cannot mix |
| AC40 | P0 | Dashboard counts multiple findings/cases | Distinct denominators; no double counting or implicit zeros |
| AC41 | P0 | Request CSAT/FCR without source | Show unavailable and explain source needed |
| AC42 | P0 | Unauthorized access to call/audio/export via URL | Server denies; no data leakage; audit |
| AC43 | P0 | Export data containing PII or formula-like text | Redact/authorize as configured; safe CSV and provenance |
| AC44 | P0 | Data retention expires or valid deletion request | Remove/access-block audio, derivatives, indexes and train eligibility; log/backup remediation |
| AC45 | P0 | Backup and restore pilot workspace | Recover metadata, authorized recordings and history; test restore, no secrets in logs |
| AC46 | P0 | Cross-workspace guessed IDs | Deny by workspace scope; if single-workspace pilot, do not claim multi-tenant deployment |
| AC47 | P0 | Training permission not granted, processing allowed | Analyze permitted data; never export it into candidate training set |
| AC48 | P0 | QA corrects a label | Record feedback; production model unchanged |
| AC49 | P0 | Two annotators disagree | Quarantine/adjudicate/unknown; no automatic inclusion |
| AC50 | P0 | Candidate dataset overlap with test or deleted data | Block training/evaluation gate; immutable snapshot with provenance |
| AC51 | P0 | Candidate model worse on target or protected old benchmark | Keep active version; evaluation report and rejection |
| AC52 | P0 | Candidate approved then operational regression | Atomic rollback; in-flight jobs pinned to version; historical results unchanged |
| AC53 | P0 | GPU OOM/timeout | Bounded retry/backpressure; no fake completion; reason logged |
| AC54 | P0 | 100 valid pilot recordings queued | No lost/duplicate jobs; measure actual latency/throughput/VRAM, no assumed scale |
| AC55 | P1 | API/inference disconnected | Visible error, retry, no silent demo fallback |
| AC56 | P0 | 1280x720 and 125% zoom | Review usable without horizontal scroll for primary task; accessible controls |
| AC57 | P1 | New QA completes upload→find→listen→submit without coaching | Record completion/time/errors; revise confusing flow |
| AC58 | P0 | Missing ID or insufficient data | Explicit not found/empty state; no substitution with a showcase call |

## 2. Validation design

Research Q1: Does multi-corpus training and telephone-domain adaptation improve expressed-emotion classification vs the historical baseline on a new target-domain holdout?
Research Q2: Does acoustic information add incremental value to text-only call triage at a fixed reviewer budget? 
Research Q3 (extension): Can vetted feedback improve target-domain performance without unacceptable regression on frozen benchmarks?

Historical F4 heads are candidates/baselines only. Checkpoint file integrity is not a serving package or reproduced model. Restore code/encoders/tokenizer/feature protocol and exact label order read-only; no changes to the research repository. Compare a fresh source model, a multi-corpus model and domain-adapted candidate on equivalent protocol. Do not select model on test. If SER does not add value, report negative result and retain useful transcript-based workflow; do not force a positive claim.

### Dataset requirements to hand over to Phase 2

- ASR: Vietnamese waveform + verified transcript, speaker/source, telephone channel where possible; benchmark WER/CER separately for real vs generated.
- SER: real/acted/elicited/synthetic tags, label definitions and label order, known speaker/session/corpus ID, raw audio, text source (gold/ASR), quality, rights. Keep original label, mapping reason, exclusions. Cross-lingual data is experimental, not automatically pooled.
- Conversation: whole calls, segment timestamps, verified or anonymous speaker, intent/negation, complaint/follow-up/resolution evidence and human relevance, script ID/voice for synthetic data. Synthetic corpus useful for integration and weak business baselines only, not independent human-call validation.
- Pilot collection: start with small consented human role-play for annotation/calibration and software testing, then seek authorized real target calls; do not call role-play real operational data. Keep all calls of same speaker/session/script/template/issue grouped to avoid leakage. Plan sample size after label prevalence and target confidence intervals; no guarantee from arbitrary sample count.
- Rights: dataset inventory must distinguish download access, research permission, commercial/train permissions, derived artifacts and deletion obligations. No private data upload to public code repository.
- Existing research data previously backed up can be inventoried after phase gate; separate dataset restoration from new datasets. Never overwrite research storage. Use reproducible manifest, checksums, environment, explicit train/dev/test IDs. Test sets used in the prior paper are historical benchmarks, not untouched new test.

### Evaluation table

| Layer | Metrics | Experimental discipline |
|---|---|---|
| ASR | WER/CER, segment coverage, timestamp error | Same transcript reference/normalization; report speaker, channel, language slices |
| Speaker separation | DER, role assignment error, unknown coverage | Anonymous cluster != role; reference annotation |
| SER | UAR, Macro-F1, per-class recall, confusion matrix, bootstrap intervals | Speaker/call disjoint, leave-one-corpus-out as appropriate, new independent target test, seed variability |
| Reliability | ECE, Brier, risk–coverage, abstention coverage | Calibrate on dev, evaluate on fixed test; full distributions for calibration |
| Business NLP | Per-label precision/recall/F1, evidence span accuracy, false alerts for negation | Synthetic and human separated; verify outcomes with independent evidence |
| Screening | Precision@K = relevant in top K / K; Recall@K = relevant in top K / all relevant; false alerts/100 calls | Equal human capacity K, compare random/text/audio/fusion/reliability; labeled negatives and random audit; grouped intervals |
| Human utility | Minutes per reviewed call, relevant findings per QA hour, missed actionable calls | Counterbalanced/manual vs assisted tasks, independent ground truth, log errors; avoid claiming causal benefit from demo |
| Learning | Target and old-domain metrics before/after, calibration, slice regressions, label cost | Compare equal budgets, random vs uncertainty sample; held-out tests; no automatic promotion |
| System | Batch success/partial/fail, p50/p95 stage+queue latency, real-time factor (wall/audio), throughput, VRAM, recovery | Fixed hardware/version, varied call lengths, report actual load and cold/warm |
| UX | Task completion, time, misclicks, user feedback, optional SUS | Test QA/operator personas, not developer only |

Thresholds and non-inferiority margins must be written before holdout evaluation, based on pilot cost/coverage and customer needs. No universal numerical acceptance target chosen without evidence. Candidate promotion requires compatible model artifacts, no critical security/data failure, satisfactory target validation, regression constraints, human approval and rollback test. Benchmark IDs and rights are versioned.

## 3. Real stakeholder discovery — outstanding

Desk research informs design but does not establish company policy. Interview at least a QA reviewer and supervisor (or a CSKH professional and domain proxy if no partner); document role, date, anonymized findings and evidence. Avoid collecting confidential recordings or customer identifiers at this stage. Ask:
1. Walk through a typical shift: where recordings arrive, how many, formats, metadata, queues?
2. Which calls do you review first and why? What costly misses and false alarms occur?
3. Show a sanitized scorecard: required steps, N/A cases, fatal errors, how disputes/calibration work.
4. Which issues need follow-up, by whom, deadlines and closure evidence?
5. Can role be determined from stereo/CRM? What happens with transfers and noisy calls?
6. What data can be stored, for how long, who can listen/export, and is training authorized?
7. Which screens/actions are used most, what would make review faster, what information is redundant?
8. What KPIs and operational targets are already tracked, what review budget is realistic?
9. What would stop you trusting or deploying the system?
10. Walk through three anonymized cases (routine, urgent/ambiguous, technical failure) with the proposed screen and rule outputs.

Capture answers as an evidence log: hypothesis ID, evidence, confirmed/rejected/unknown, decision, owner. Validate whether e-commerce inbound is a suitable first pilot or choose another single queue. Agree on ground-truth definition, policy/form, priority/SLA, permissions/retention and deployment scope. Do not claim interviews that did not occur.

## 4. Repo and execution baseline (read-only comparison)

The public product repo has multiple divergent feature branches. The remote-GPU branch dated 2026-11-23 contains more implementation assets than main (ASR adapters, QA triage scripts, workflow, DB hardening, tests and runbooks); the SER review branch dated later contains another workspace implementation. Code presence/documentation is not runtime verification. Use the richer remote-GPU branch as the comparison baseline for discovery only; later implementation may refactor or replace code after a gap audit, not blindly merge divergent branches. Research repository is read-only reference, never a deployment target. No code or runtime data changed in Phase 1.

Observed from code/docs, not independently executed:
- Existing upload/job/retry, review, follow-up, SQLite and ASR/QA adapters are candidate reuse.
- Historical docs report real ASR and synthetic-corpus text classifier; current runtime not rechecked.
- Full authentic waveform-to-F4 inference and validation still need work; no claim from found heads.
- RBAC, workspace isolation, full evidence lineage, reliable model registry and continuous learning must be checked/implemented. Do not infer from route names that they are complete.
- Existing UI should be evaluated against task-first flow; screenshots and live behavior needed before usability sign-off.

Remote GPU resources may be available for research; user reports no time/cost constraint. Before later runs confirm actual access, shared storage quotas, GPU concurrency, data permissions and environment. Do not expose SSH aliases, paths, tokens, private research files or audio in public commits. Use separate product environment and read-only research source.

## 5. Phase 1 exit gate

| Gate | Status at authoring |
|---|---|
| Identify target user/need and product boundaries | Draft complete |
| Compare public vendor docs and domain research | Complete as desk research |
| Define workflow, states, data contract, role/permission and UX | Draft complete |
| Separate SER from business finding, QA verdict and case outcome | Draft complete |
| Versioned rule catalogue and example scorecard | Draft complete; not validated as policy |
| Acceptance scenarios and metric definitions | Draft complete; no tests executed |
| Stakeholder interview / target domain and policy approval | Outstanding |
| Permission and real-data access for pilot | Outstanding |
| Model/data recovery and training | Deferred to Phase 2/3 by request |
| Product code implementation | Deferred; Phase 1 documentation only |

Proceed to Phase 2 only once the owner reviews this document and explicitly accepts the first target workflow and open assumptions; real customer pilot remains blocked until data rights and policy are established. If no partner is available, role-play and qualified proxy validation can support an academic prototype, but the limitation remains explicit. Do not mark production readiness or empirical effectiveness based on this discovery document.
