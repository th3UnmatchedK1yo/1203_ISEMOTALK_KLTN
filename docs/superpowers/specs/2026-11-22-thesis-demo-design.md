# ISEmoTalk — thesis and demonstration design

Date: 2026-11-22 (Asia/Ho_Chi_Minh). Baseline: `9f7ced37d7ddbf253bc7946c111662bc8732e785`, PR #5. This design implements the user's request to audit, plan and improve the existing application; it does not redefine the accepted research protocol.

## Purpose and boundary

ISEmoTalk is a local, post-call review workbench for Vietnamese customer-service conversations. A reviewer listens to timestamped evidence, checks model suggestions, records a business outcome and assigns follow-up. The system reduces the work of locating passages worth checking. It does not establish customer satisfaction, employee competence or resolution from emotion predictions alone.

Three independent states must remain visible: processing (`queued/processing/ready/failed`), human review (`unreviewed/in_progress/reviewed`), and business resolution (`unassessed/open/follow_up/resolved`). A completed inference job does not close a ticket.

## Approaches considered

1. **Strengthen the existing React/Express/SQLite/FastAPI post-call application** — selected engineering approach. Fits the user's existing laptop, working offline ASR and review interface. Adds no distributed infrastructure. It remains a local single-user demo, not a production contact-center platform.
2. **Add live telephony and streaming alerts now** — deferred. Requires media streaming, authentication, telephony integration, concurrency and domain validation not supplied by current artifacts. Adds failure points before genuine SER restoration.
3. **Build a broad CRM and automatic employee score** — rejected for this iteration. Would obscure the SER contribution and introduce unsupported outcome claims.

## Research connection and evidence

The provided `ser_v10_1_postreview.pdf` separates three endpoints:

| Endpoint | Model / question | Product implication |
|---|---|---|
| RQ1 / F1 | XLS-R + XLM-R independently fitted linear heads; speaker-resolved complementarity | Preserve actual model identity and show per-modality evidence only when these outputs exist. |
| RQ2 / B2 | emotion2vec + TF–IDF logistic fusion; fixed audio, transcript substitution | Make transcript corrections and their relationship to old predictions visible; do not silently relabel an old inference result as recomputed. |
| RQ3 / F4 | emotion2vec + PhoBERT cross-attention; matched continuation and VNEMOS evaluation | Bind deployment verification to checkpoint/config/factory artifacts and declare corpus shift. Benchmark scores are not call-center accuracy. |

F4's genuine checkpoint has a fused classifier; it does not by itself provide independent acoustic and lexical predictions. Those fields must remain unavailable until genuine separate heads are restored. The working `faster-whisper-small` ASR is a demo runtime choice and is not the paper's frozen PhoWhisper text axis. Head weights alone do not restore the audio/text feature pipeline.

## In-scope deliverables

### A. Data and job integrity

- Durable monotonic local call identifiers; deleting a call must never make a later call inherit its identifier.
- Cancel/ignore in-flight results for deleted work. Graceful shutdown must not write into a closed database.
- Validate inference response structure, finite values, time ranges and ID coverage before persistence.
- Preserve explicitly supplied speaker labels; never treat unknown speakers as customers or infer an agent role merely from speaking first.
- Preserve source of ASR, speaker assignment and SER separately in persisted processing evidence; imported and mock data remain labeled.
- Text edits keep original model input visible and mark results as based on the prior text. Human labels remain independent of original model output.
- Malformed imports and invalid pagination return controlled client errors; invalid metadata leaves no audio orphan.

### B. Inference readiness and resource use

- Keep synchronous CPU work off the ASGI event loop (existing `def` routes already do this).
- Bound duplicate decode work and stereo memory use without changing feature semantics.
- Provide an explicit, local-only ASR warmup/check path where feasible; never download new weights implicitly.
- Verification requires a nonempty, valid four-class manifest, finite thresholds, and cryptographic artifact identity. Loading/verified status must not imply business-domain accuracy.
- Keep CPU INT8 small as the laptop's existing ASR default. Do not install GPU stacks or choose a larger model without measured benefit.

### C. Review UX and demo stability

- Abort or ignore stale initial loads; serialize polling; recover transient polling errors.
- Prevent edits being lost during save; retain per-call versioned drafts for the current browser session and report conflicts explicitly.
- Make changed-payload computation linear; avoid rendering the entire transcript on each audio progress update.
- Resolve every download through configured API origin; reset hidden file input state when switching import modes.
- Preserve navy/teal identity, readable body text, clear focus, strong badge contrast, and tables that fit desktop and narrow screens.
- Primary hierarchy: call identity/context → recording/timeline → transcript/evidence → review decision. No decorative gradients, artificial metrics or marketing filler.
- Explicit unknown customer coverage and model score explanation; rules are review cues, not established risk probabilities.

### D. Minimum real business workflow

New call workflow resource, independently versioned from SER review:

- `externalContactId`, `ticketId`, `queueName`, `reason` (optional operational context; do not invent PBX/CRM integration).
- `resolution`: `unassessed | open | follow_up | resolved`.
- `nextAction`, `owner`, `followUpAt` (ISO UTC), `outcomeNote`, `reviewerName`.
- Follow-up requires owner, next action and due time. Resolution requires an explicit outcome note. Closed resolution clears an active follow-up deadline.
- Each successful change records an append-only event with submitted reviewer label, timestamp and changed field names. Local reviewer labels are not authenticated identities.
- A conflict returns HTTP 409 without overwriting changes. Existing calls receive an empty logical workflow, not synthetic customer/ticket data.

Endpoints: `GET/PUT /api/calls/:id/workflow`; request `{baseVersion, ...fields}`; response `{callId,version,...fields,updatedAt,history}`. Initial version is 0 and history empty. Writes are atomic; deleting a call cascades its workflow and events.

### E. Explainable thesis and operating guide

- A Research & scope screen explains paper → design decisions → evidence and limits. No fabricated benchmark dashboard.
- An audit and roadmap lists fixed issues, remaining gates, exact model restoration requirements, and realistic evaluation design.
- A demonstration runbook provides cold/warm checks, a preprocessed genuine-result route when available, failure recovery, a 5–7 minute narrative and defense questions.
- Performance numbers must be measured and identify hardware/data/backend mode. Automated mock orchestration performance is not ML throughput.

## Explicit limits

This batch does not train a model, claim a restored end-to-end raw-audio SER pipeline, generate a new research result, integrate a PBX/CRM, supply production auth, guarantee real-time performance, or automatically score staff. A production extension needs access control, retention, monitoring, human QA rubric validation and evaluation on representative call recordings. These are roadmap gates, not claims about the demo.

## Acceptance

1. Existing build/typecheck/tests run against actual installed dependencies; regressions reproduce concrete bugs before fixes.
2. New workflow persists, rejects invalid transitions and stale writes, and does not change model predictions or review completion.
3. Review draft and delayed-request behavior checked; export and import work from the actual served app.
4. Browser screenshots inspected at desktop and narrow width; no horizontal body overflow and core labels readable.
5. Python lightweight tests validate contracts/resource behavior without pretending to test absent models.
6. Full branch receives independent review; limits and exact remaining laptop checks are documented. Code lives on a new branch; existing branches and user databases are not reset.

## Evidence update at integration

The uploaded main October archive contains all9 historical H5 heads; hashes, metadata and parent references were verified without loading models. This corrects earlier missing-head assumptions. Full pretrained features/factory equivalence and later-lineage matching remain open. Browser screenshot acceptance could not be executed in this environment and stays on the laptop checklist.
