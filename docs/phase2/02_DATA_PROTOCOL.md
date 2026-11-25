# Phase 2 — Unified multi-corpus data and training protocol (revised)

## 1. One inventory, several tasks

All corpora are ingested into one provenance-aware inventory, but not all rows are forced into one target label. A row may supervise one or more tasks:

| Task | Input | Supervision | Main output |
|---|---|---|---|
| ASR | Audio | Human transcript or pseudo-transcript with source/confidence | Text + alignment |
| Acoustic SER | Audio | Original emotion annotation | Corpus-specific emotion head + common four-class head when compatible |
| Text emotion | Transcript | Emotion label | Corpus-specific/common head |
| Multimodal SER | Audio + transcript | Paired emotion annotation | Fusion prediction |
| Conversation intent/attention | Whole conversation/turns | Intent, topic, needs_attention | Business category |
| Diarization/role | Audio/channel metadata | Speaker/turn labels where available | Anonymous speaker clusters; role only when supported |
| Audio quality/channel | Audio | Source metadata and computed quality | Noise/overlap/clipping/bandwidth flags |
| QA workflow | Findings and rules | Rule/form test cases | Suggested tasks and reviewer workflow |

Do not require every dataset to have every annotation. A corpus with audio+text but no emotion still trains ASR. An emotion corpus without transcript still trains acoustic SER. A call-level needs_attention label does not become an utterance-level emotion label.

## 2. Multi-stage model strategy inspired by VLSP 2025

The published VLSP 2025 approach explicitly describes:
1. Stage 1: train/fine-tune ASR with all available Vietnamese speech data, then filter for transcript/audio quality.
2. Stage 2: fine-tune SER using Vietnamese and international emotion datasets, combining classification and supervised contrastive objectives; leverage the ASR encoder and audio/text fusion.
3. Stage 3: optimize inference by combining neural predictions and retrieval/k-NN signals.

ISEmoTalk will use this as a reference, not blindly copy their model. Source: https://aclanthology.org/2025.vlsp-1.2.pdf

### Stage 1 — ASR corpus expansion
- Train/fine-tune an ASR candidate on Vietnamese labeled audio from VLSP2023, PhoAudiobook, viVoice, Bud500, 28k_VigBigData, ViMD, VIVOS, FOSD, FLEURS train, VietMed labeled data, and other accessible corpora.
- Use unlabeled Vietnamese audio for self-supervised/teacher-student experiments only if the chosen recipe supports it; do not invent transcripts.
- Use pseudo-labeled sources (e.g. GigaSpeech2 raw, VietSuperSpeech) with source confidence and quality filtering. Compare raw vs refined.
- Keep FLEURS/GigaSpeech2 official dev/test frozen. Do not use test audio/transcripts for training or threshold tuning.
- Benchmark PhoWhisper/faster-whisper or a fine-tuned ASR candidate against the same references. Do not assume retraining from scratch beats a strong pretrained model.

### Stage 2 — SER multi-corpus/multi-task
- Primary shared acoustic encoder: compare emotion2vec, WavLM/wav2vec2 and the recovered F4 model pipeline; select on validation.
- Shared representation + corpus-specific output heads preserves original ontologies. A common four-class target head is trained only from labels with defensible mapping.
- Additional heads retain 5/6/7/8-class corpora and binary neutral/negative labels; they still contribute gradients to the shared encoder.
- Use class/corpus-balanced sampling, supervised contrastive learning, cross-entropy and optionally domain-adversarial/domain-conditioned learning. Run ablations rather than assuming the most complex recipe wins.
- Text branch: PhoBERT or suitable multilingual encoder. Prefer human transcripts where available; ASR hypotheses are stored as separate input condition. Train/evaluate gold-text vs ASR-text conditions to quantify ASR error propagation.
- Audio-only datasets contribute to the acoustic branch even without transcript. Do not fabricate text.
- Evaluate within-corpus and leave-one-corpus-out. Keep language and corpus IDs in the report. Report Vietnamese target results separately from English/German auxiliary results.

### Stage 3 — Conversation intelligence and call screening
- OneVoice supports call-level needs_attention/topic classification and UI workflow tests. Do not transfer its synthetic label to emotion.
- MELD_VIET can be assigned after archive schema inspection.
- ASR + SER + text intent/topic + quality flags produce timestamped evidence; a rule engine converts evidence into suggested categories/tasks.
- Public enterprise QA rules are configured as editable templates; they are not claimed as validated policies of a real customer.

## 3. Ontology strategy

Canonical four-class output: neutral, happy, sad, angry. Preserve original source labels and define mappings in a versioned table.

| Original label pattern | Treatment |
|---|---|
| Exact neutral/happy/sad/angry | Common head |
| Fear, surprise, disgust, boredom, frustration, excitement, calm | Dataset-specific auxiliary head unless an explicit mapping experiment is justified |
| Binary negative/neutral | Binary auxiliary head |
| Enjoyment | Keep original; test mapping to happy only as a separate ablation |
| Composite anger+disgust | Preserve composite label; do not pretend it is pure anger |
| Unknown/uncertain annotation | Exclude from supervised loss or use explicit soft/weak-label strategy; retain for analysis |

Every mapping has original label, target mapping, rationale, source paper/card, mapping version and ablation. No silent label rewriting.

## 4. Data quality and balancing

- Validate decode, duration, sample rate, channel count, clipping, silence, truncation and checksum.
- Deduplicate exact file hash and decoded PCM hash across all corpora; then run near-duplicate/audio fingerprint and transcript/script similarity.
- Keep speaker/session/conversation/script IDs. Group splits by connected components; don't split utterances from the same conversation/speaker across train and test where the corpus permits.
- Source IDs are namespaced; same speaker may appear under different IDs across corpora. Use known source metadata first; do not identify people from voice.
- Keep all usable records in a declared role. Quality filtering means weighting/partitioning/flagging, not automatically deleting a whole corpus.
- Apply class and corpus-balanced sampling on train; report natural distributions separately. Avoid letting the largest audiobook corpus dominate the smaller emotional corpus.
- Augmentation: telephone band-pass/8kHz, codecs, noise, reverb, speed/pitch and SpecAugment on training only. Keep transformed samples linked to their originals and never count them as independent evaluation examples.
- Preserve human transcript vs pseudo transcript vs ASR hypothesis. Use WER/CER/CTC confidence or manual spot-check for quality filtering; report thresholds and ablations.

## 5. Product/business rules — reuse industry patterns

We do not need a partner company to implement a configurable prototype. Use public product documentation as the source of workflow patterns:
- Amazon Connect Contact Lens rules support keyword/phrase, semantic, sentiment-over-time, entire-contact sentiment, interruption and non-talk/other conditions; actions can categorize, alert or create tasks.
- Amazon evaluation forms support sections/questions, weights, conditional follow-up questions, optional/N/A questions, percentage or point scoring, and automated answers from analytics categories/metrics.
- NiCE Quality Planner uses filters to sample random interactions and distribute them to evaluators with an attached evaluation form.
- Genesys evaluation forms measure script adherence, compliance, customer satisfaction and business benchmarks; include question-level scoring and critical questions.

ISEmoTalk default rule packs:
1. Customer request: callback, cancellation, refund, escalation to supervisor.
2. Complaint and resolution: explicit unresolved issue, promised action vs verified outcome.
3. Conversation quality: greeting/conclusion, interruption, hold/non-talk duration, missing mandatory steps when evidence is available.
4. Customer expression: sustained negative sentiment/emotion trend and end-of-call change as review signals, never direct agent fault.
5. AI reliability: modality disagreement, low calibrated certainty, unsupported language, overlap, bad audio, unknown role.
6. Sampling: targeted rule sampling + random audit across all eligible calls, including calls with no alert.

Each rule is configurable by tenant/queue, AND/OR conditions, threshold, time window, severity, action and effective version. Actions: tag/category, create QA task, create follow-up proposal, supervisor alert, attach a dynamic evaluation form. Model prediction alone cannot close a follow-up or prove service failure.

References:
- Amazon rules: https://docs.aws.amazon.com/us_us/connect/latest/adminguide/build-rules-for-contact-lens.html
- Amazon evaluation forms: https://docs.aws.amazon.com/connect/latest/adminguide/create-evaluation-forms.html
- NiCE Quality Planner: https://help.nicecxone.com/content/qmanalytics/qp/qualityplanner.htm
- NiCE QM: https://help.nicecxone.com/content/qmanalytics/welcometoqualitymanagement.htm
- Genesys evaluation forms: https://help.genesys.cloud/?p=4207
- FPT AI Enhance: https://fpt.ai/vi/san-pham/fpt-ai-enhance/

## 6. Demo plan without new human/company data

No new human recording or company partnership is a requirement.
- Use OneVoice synthetic calls for whole-call upload, ASR, call-level attention/topic and workflow demonstration.
- Use ViSEC/LUCEE/VNEMOS/IEMOCAP and other emotion datasets for utterance-level SER playback and model comparison.
- Use MELD_VIET if its archive contains suitable audio/dialogue/emotion labels.
- Use DataHive phone sample/CALLFRIEND if available for phone-channel demonstration, with clear provenance.
- Build deterministic scenario fixtures from published enterprise rules (callback, cancellation, unresolved complaint, greeting, hold, interruption, random audit) for rule-engine testing. Mark these as simulated test cases, not real customer outcomes.
- Demo the actual trained inference pipeline on real corpus audio, not hardcoded mock predictions. Synthetic calls are explicitly labeled synthetic.

## 7. What "use all" means

Every accessible corpus is acquired and audited. Every row is assigned to an appropriate train/dev/test/auxiliary/diagnostic role. A sample in a frozen test split is used for evaluation, not training; this is not wasting data. The same sample must not be used both to fit and claim independent evaluation. For small datasets, use grouped cross-validation so all examples rotate through held-out folds.

More data does not automatically improve model quality: label noise, domain mismatch, duplicates and corpus imbalance can hurt. We will compare full-data vs quality-filtered vs corpus-balanced experiments. More data generally increases training time; inference speed is optimized separately.
