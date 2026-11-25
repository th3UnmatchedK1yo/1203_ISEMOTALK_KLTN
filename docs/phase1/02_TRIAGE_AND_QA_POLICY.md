# Phase 1 — Triage, measurements and human QA policy

Design proposal, not validated thresholds or automated employee grading. All rules must be versioned and calibrated with actual target data. No direct inference of true emotion, satisfaction or misconduct.

## 1. Four different targets

| Target | Unit | Definition | Ground truth |
|---|---|---|---|
| SER | Speech segment with a reasonably identifiable speaker | Perceived expressed emotion (neutral/happy/sad/angry), uncertainty/abstention separately | Independent listener annotations, not script intent or AI confidence |
| Business finding | Segment or call | Explicit or supported indication of a complaint, request, process issue or follow-up | Human adjudication plus policy/CRM evidence when needed |
| QA relevance | Call/task | Would a qualified reviewer need to listen/verify for the given policy? | Independently reviewed calls including non-alerted random sample |
| QA score | Human review | Evidence-backed answers to versioned business checklist | Reviewer verdict and adjudication, not SER |
| Case outcome | Case | Resolved/awaiting action/unknown, with evidence | Authorized human/CRM or external disposition |

Emotion class is nominal, not an ordinal intensity scale. No arithmetic on category codes. No conversion of a softmax probability to anger intensity or service quality. Abstain reasons include unsupported language, mixed speakers, unreliable signal, missing model, low calibrated certainty; unknown is not neutral and is not automatically a fifth trainable class.

## 2. Data readiness and measurements

Let customer-attributed, valid, non-overlapping speech time be D. Coverage = D / total detected speech time (state denominator). If roles unknown, customer-only metrics unavailable, show call-level speaker-agnostic signal explicitly labeled. If insufficient coverage, suppress customer trajectory and flag data verification. Never interpret mixed voices as a single customer.

- Negative speech ratio = sum of eligible customer speech durations with predicted angry or sad / D. Durations clipped to actual segments and overlap removed; report excluded/abstained duration separately. No implicit zeros.
- Sustained negative: consecutive eligible same-role segments with negative predictions and small allowed gaps; max gap and minimum duration set on validation, not arbitrary rules passed as clinical facts.
- Escalation/recovery: observed change in predicted expression within a verified same-role trajectory. No comparison across different/unknown voices. No inference of resolution or employee quality.
- End-window expression: last eligible customer speech in defined final time window; if absent/partial, unavailable.
- Modality disagreement: differing acoustic/lexical top-1 labels for segments where both predictions exist; denominator both-valid segments. Optional distribution divergence (e.g. Jensen–Shannon) when full class vector and matching label order are available; not proof of sarcasm.
- Uncertainty: validation-calibrated probabilities, entropy/margin, risk-coverage or OOD/quality flags. Top-1 below provisional threshold only a triage heuristic. Missing predictions are not low confidence; handle separately.
- Non-talk, overlap, hold: seconds and ratio from valid audio intervals; silence is not necessarily hold (need telephony event or reliable detection). Overlap is not necessarily interruption. Separate VAD quality and evidence.
- Topic/intent: multi-label, positive/negative negation, speaker context, evidence span, allow unknown; no hallucinated details.
- Outcome: explicit stated next step vs verified completed action. “Em sẽ hoàn tiền” ≠ actual refund.
- Customer-only SER should be exposed after verified roles; anonymous segments may be used for technical validation with consent, not worker profiling.

## 3. Rule catalogue (initial policy for e-commerce inbound)

Each rule has ID, version, prerequisites, candidate signal, evidence, destination, severity, scope, reason, effective date. Rule output is a suggested finding, not a final verdict. All examples are design cases, not model results.

| ID | Candidate signal | Prerequisite / guard | Destination |
|---|---|---|---|
| R01 | Customer requests callback | Affirmative request or explicit promise, role known/verified, timestamp; negation/quoted speech excluded | Follow-up proposal |
| R02 | Complaint remains unresolved | Explicit unresolved statement, no confirmed resolution; uncertain goes to QA, not automatically a case | Follow-up/QA |
| R03 | Cancellation/refund/escalation request | Intent + entity/action scope; no “không muốn hủy” false positive | Follow-up proposal / QA |
| R04 | Explicit material service/policy issue | Policy version plus supporting evidence; absence of evidence ≠ violation | QA |
| R05 | Missing mandatory step | Applicable form and complete relevant portion of call; else Not assessable | QA |
| R06 | Sustained negative expression | Verified customer role, sufficient coverage, validated SER/threshold | QA, never automatic fault |
| R07 | Expression escalates/recovery | Same verified role/time, coverage; recovery can be coaching example, not closure | QA / optional coaching example |
| R08 | Negative final-window expression | Valid customer speech near end | QA, not unresolved by itself |
| R09 | Modality disagreement | Both heads present and same label space, aligned segment | AI verification |
| R10 | Low model certainty/OOD | Calibrated or explicitly heuristic score; compatible model | AI verification |
| R11 | Poor recording/overlap/language/role uncertainty | Quality flags, ASR/alignment coverage and metadata | Data verification |
| R12 | Long non-talk/overlap | Evidence seconds and policy; no automatic blame | QA |
| R13 | Random audit | Reproducible random sampling of eligible population including no flags, stratify by queue/time if appropriate | QA |
| R14 | Failed pipeline | Job/stage error; not a customer-service finding | Operator technical queue |

Priority is per task, not single “risk score” for all. P1: supervisor-confirmed time-sensitive follow-up, explicit urgent request per policy; P2: relevant unconfirmed follow-up or QA signals; P3: routine sampling/technical verification per SLA. Model uncertainty alone must not create a high-severity customer case. Technical errors have their own operational priority. Configurable rule priority and due date are business policy, not model probability.

Queue ordering: deadline/overdue → severity → oldest → stable ID. Deduplicate by call + rule version + evidence event; merge related tasks by call and category. Preserve reasons and independent task states. Reviewer can dismiss, confirm, defer, or mark insufficient. A human can manually add a case even without flags. Follow-up proposal must be confirmed by an authorized human; no automatic contact.

### Ranking research policy

Train/validate a ranking model later only if enough independent relevance labels. Compare content-only, acoustic-only, fusion, fusion+reliability; maintain random baseline. On a fixed QA budget K, evaluate Precision@K, Recall@K, false alerts per 100 eligible calls and time-to-find; group by speaker/call/issue. Keep random review for estimating missed positives, not only flagged examples. Tune thresholds on validation (e.g. review capacity and minimum recall agreed with supervisor), freeze before test. No invented weights or universal anger threshold.

## 4. Example human QA scorecard (proposal, not company policy)

| Item | Weight | Evidence required |
|---|---:|---|
| Q1 Issue understood/clarified | 20 | Customer request and response |
| Q2 Correct information/instructions | 25 | Conversation + applicable approved policy or service record |
| Q3 Applicable verification/compliance | 20 | Evidence of applicable steps; do not expose ID in notes |
| Q4 Clear next steps/commitments | 20 | Explicit action, deadline if applicable |
| Q5 Clear respectful communication | 15 | Specific audible/semantic behavior, not inferred emotions |

Answer PASS/FAIL/NOT_APPLICABLE/NOT_ASSESSABLE. Optional partial score only if defined and calibrated in the form version. For applicable assessed criteria, score = 100 × sum(passed weights) / sum(assessed weights). Separately coverage = assessed applicable weights / total applicable weights. N/A excluded; unknown still counts in applicable denominator. If no assessed criteria, score unavailable; if insufficient coverage or critical compliance unknown, display incomplete rather than “passed”. Critical verified violation flag independent of score and adjudicated by human. Never use customer/employee SER as scorecard item. User can review an entire call rather than only flagged excerpts.

Examples: a calm customer asking cancellation may need follow-up; an angry customer correctly helped can pass QA; a customer says “cảm ơn” while frustrated, only evidence prompts listening; a refund promised is not verified completed; missing opening due to recording truncation is Not assessable, not Fail.

## 5. Feedback policy

Feedback types stored separately:
- Emotion: confirmed/corrected/unknown + listener/source, timestamp, annotation revision, whether labeler saw prediction.
- ASR: corrected text and original version, role/time corrections separately.
- Alert: relevant/not relevant/unknown with reason; negative labels from random audits also retained.
- Business: checklist answers, outcome with source, follow-up status; external truth not inferred.

For evaluation, blind annotation before seeing model predictions, at least two independent listeners for benchmark samples and adjudication, report agreement and uncertain label rate. Production reviewer feedback can be a candidate weak label but not automatic ground truth. Disputed labels quarantined. Training rights checked at sample level; private customer data not shared across clients by default. No online self-training on arbitrary clicks. Keep old model immutable and dataset lineage. Deletion/revocation must propagate to derived training sample eligibility; evaluate remediation/retrain needs for already trained models in governance policy, not pretend deleting one row unlearns weights.

## 6. KPI semantics

- Analysis coverage: completed required stages / eligible recordings; show partial and failed separately.
- QA review coverage: distinct submitted/accepted call IDs / eligible calls, not number of alerts.
- Follow-up: confirmed open, overdue, completed with evidence; count distinct cases.
- QA score: human-reviewed scored calls only, disclose coverage and form version. No comparison across incompatible forms.
- Alert relevance: relevant / decided alerts; selection bias and undecided reported.
- FCR, CSAT: unavailable absent linked repeat-contact/disposition or survey data; no proxy from emotion alone.
- AHT: telephony handle time requires hold/wrap metadata; audio duration is only recording duration.
- Model metrics: independent labeled set, model version, corpus, counts and uncertainty; separate production inference volume from benchmark accuracy.

See 01_PRODUCT_REQUIREMENTS.md for product context; 03_VALIDATION_AND_DISCOVERY.md for evaluation and release gate.
