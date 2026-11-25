# Phase 2 — Data protocol and experimental handoff

## 1. Separate tasks and sources

- ASR: audio and reference transcript; gold vs pseudo/ASR transcript clearly distinguished. FLEURS test only benchmark; FOSD diagnostic/development, not assumed independent of pretrained ASR.
- SER: eligible speech segments, original label + mapping + speaker/session/conversation + source + quality. Canonical labels neutral/happy/sad/angry; unknown/abstain is a system status, not automatic fifth class. For IEMOCAP strict mapping neu/hap/sad/ang; excited excluded unless an explicitly separate historical reproduction uses a different label protocol. Fear/anxiety, disgust, surprise excluded from strict four-class training. Preserve original labels.
- Call business NLP: OneVoice call-level attention label, synthetic-only, no transfer of sentiment to utterance SER labels. Real relevance and case outcome must be independently annotated.
- Diarization: channel metadata or time-stamped anonymous speaker labels. Agent/customer role requires separate evidence.
- Target corpus: role-play and operational recordings are different domains. Preserve raw files; never assume scripted intended emotion is annotation ground truth.

## 2. Data layout and immutable provenance

Private raw data outside checkout, with four original dataset directory names and separate OneVoice folder. Source manifests are read-only. Audit records source, sample ID, path, original label, mapped emotion, group keys, text source, quality status, duration/channel/rate, raw SHA256 and PCM digest. LUCEE checks declared audio SHA256. WAV decoder reads frames to catch truncation. No conversion yet; unsupported audio is flagged rather than silently treated as silence. Later canonical derivatives: 16 kHz mono per verified speaker segment, original timebase mapping, preserve multi-channel source, per-artifact hash, VAD/ASR versions, no clipping or time shifts without logged policy.

Duplicate detection uses exact byte and PCM hash. Different codecs/resampling or near duplicates need later acoustic fingerprint/similarity + manual review. Normalize text for repeated-script diagnostics while retaining original and corrected transcript. Do not group every generic phrase as the same script; record source script/template IDs and conversation IDs. Namespaced speaker IDs cannot detect the same individual across corpora; provenance/voice similarity checks need explicit evaluation and permission, not identity inference. Check test overlap with upstream pretrained models where known; disclose unknown.

## 3. Group-based splits

The provided fold tool only prepares **development folds**, not final unseen target test:
- ViSEC: exclude ID=0, unknown, invalid and exact duplicates from strict folds; 5 folds by linked groups with deterministic class-aware assignment. Report per-class support. Compare paper splits separately; do not call new folds reproduced paper.
- LUCEE: connected groups from speaker+conversation+pair, leave one component out. Originally 6; if metadata/audio audit changes count, use actual connected groups, never split connected components. Stop if class support missing; define alternative evaluation before observing target performance.
- VNEMOS: historical benchmark only after license and audio QC; no tuning or training; no claimed speaker disjointness.
- IEMOCAP: session-disjoint auxiliary experiment only; not automatically in Vietnamese production training. Use exact protocol and rights in later stage.
- OneVoice: evaluate text business baseline; metadata includes limited five customer voices, many shared agents. Group by customer, report overlap in agents, and check script/template duplication. Joint speaker disjointness may be impossible if the bipartite voice graph is connected; report instead of mislabeling split. Keep independent human call target.
- Real target: lock entire call, speaker groups, session, script family (role-play), organization/time where appropriate. Dev and blind target test independently collected before model selection; never use historical VNEMOS or feedback test data for repeated tuning. Keep time-forward holdout for continual learning.

No train call occurs in Phase 2. Later compare source-only, multi-corpus, and target-domain adaptation with same splits and compute budget. Use class/corpus balance on TRAIN only. Evaluate per corpus/class, speaker/region/telephony conditions; report uncertainty and coverage. For robustness training, augment TRAIN only with documented noise, bandwidth 8kHz, codecs, packet loss/silence; pair all transformed samples with original group; do not treat augmentations as independent test cases.

## 4. Pilot collection protocol

Initial proposed pilot: 40–60 human role-play calls to test annotation and software, then enlarge based on prevalence, speaker groups, confidence intervals and label disagreement; no guaranteed sample-size claim. Recruit diverse volunteers with permission, separate script families and speaker groups across folds. Record real two-channel/mono variants, transfer/third participant, overlap, background noise, interrupted calls, code-switch, IVR/hold/silence. Use fictional order IDs and avoid real payment, health or account information. Never record without consent. For target real pilot, negotiate data-use agreement and rights before any transfer; keep encrypted workspace-local storage.

Coverage matrix: routine inquiry, late delivery, failed delivery, wrong order, return/refund, promised callback, unresolved complaint, calm cancellation, escalated request, positive recovery, negated request/quoted words, uncertain audio/unknown role. Mix short and long calls, varied accents and naturally different expression; avoid assigning expected emotion solely from script. Sample routine calls, not only negatives.

Annotation layers:
1. Segment boundaries, verified speaker role or unknown, overlap, unusable/audio quality flags.
2. Two independent listeners blind to model, label perceived expression or unclear/out-of-scope; adjudicate disagreements. Report agreement and unclear rate. Do not infer private mental state or rate worker emotion for employment.
3. Transcript reference with time alignment, ASR errors, no fabricated missing words.
4. Business intent (multiple possible), action/negation, evidence spans, follow-up required yes/no/unknown, outcome verified vs stated vs unknown.
5. Independent QA relevance and checklist with policy references and not-assessable; random routine sample needed to estimate missed alerts.
6. Rights: analysis, research training, commercial training, retention, withdrawal tracking. No assumption permission to record implies permission to train.

Use template in data_pipeline/target_annotation.example.json as a blank schema illustration, not a labeled dataset. Real labels must not be committed publicly.

## 5. Data release gate

- All selected corpora acquired/verified with pinned revision, hashes, permission evidence, documented exclusions.
- Audio parse/QA passed; raw and derived lineage retained; no missing files silently skipped.
- Exact duplicate checks and near-duplicate/script checks across sources; strict groups audited; no test data augmentation or tuning.
- Source text provenance and ASR coverage available for multimodal tasks; model-dependent features belong in Phase 3.
- Independent target data with enough credible annotations; benchmark policy written before target evaluation.
- Frozen manifest hashes, rights and split evidence reviewed by owner; no model trained before gate.
