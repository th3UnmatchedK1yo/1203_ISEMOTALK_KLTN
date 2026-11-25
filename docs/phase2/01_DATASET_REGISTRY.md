# Phase 2 — Dataset registry (revised: maximize all usable corpora)

Date: 2026-11-25. This revision follows the user's clarified scope: academic/non-commercial KLTN; no company partnership or new human data collection is required. We will use all existing and accessible datasets in the task they actually supervise. We will not reject a research dataset solely because its license is non-commercial. Access gates/required acknowledgements must still be completed; do not bypass gated downloads or redistribute raw data.

## 1. Core strategy

Use a broad multi-corpus, multi-task training pipeline:
- ASR data teaches Vietnamese acoustic/language representations and supplies transcript hypotheses.
- Emotion corpora supervise SER; compatible four-class labels feed the target head, while extra/binary labels remain auxiliary heads.
- Call/conversation corpora supervise call-level topic, attention, intent and workflow tasks.
- Telephone corpora improve channel robustness and speaker separation.
- Synthetic and public data are valid for academic experiments and product-flow demonstration, but remain tagged as synthetic/public and are not claimed to represent a real enterprise deployment.

A dataset is not required to supervise every task. Every usable dataset should contribute to at least one appropriate task. Preserve corpus identity, original labels, split, speaker/session/conversation IDs and transcript provenance. Do not concatenate incompatible labels as if they meant the same thing.

The VLSP 2025 paper is a particularly relevant recipe: Stage 1 uses diverse Vietnamese ASR corpora and data-quality filtering; Stage 2 fine-tunes SER using Vietnamese and international emotion datasets with a hybrid cross-entropy + supervised contrastive objective; Stage 3 improves inference by combining model and k-NN predictions. It reports the following sources and sizes, which we use as acquisition targets rather than assuming they are already downloaded: VLSP2023 (300h), PhoAudiobook (1494h), viVoice (1000h), viet_bud500 (500h), 28k_VigBigData (460k utterances), ViMD (100h), VIVOS (15h), ViSEC, IEMOCAP, EMO-DB, RAVDESS, CREMA-D and EmoV-DB. Source: https://aclanthology.org/2025.vlsp-1.2.pdf

## 2. Existing Drive data — verified metadata

The connected Drive backup has been inspected at metadata level:
- ViSEC: all 5,280 CSV rows read; 3.1759h, four labels, 146 known speaker IDs and 2,217 rows with speaker_id=0; 3,618 southern, 1,336 northern, 326 central.
- LUCEE / VI_FINAL: all 701 JSONL rows read; 8 speakers, 223 conversations, 6 speaker/conversation/pair connected components (185,139,95,95,94,93 rows), four labels, human-reviewed transcripts and approved QC metadata.
- VNEMOS: all five folders exist, 50 WAV files each (250 total): angry, fear, happiness, neutral, sadness.
- IEMOCAP: five sessions exist, 151 emotion annotation files across sessions. Session 1 structure was inspected; complete audio hash audit is pending.
- MELD_VIET_CLEANED_DATA: discovered a 1,190,709,785-byte archive named stage_04_synthetic_technical_clean.zip. Its internal schema and contents have NOT yet been inspected; include it in the next server inventory rather than assuming its task/labels.
- SER_BACKUP_TEST is currently empty.

No raw Drive audio was downloaded/rehashed in this metadata pass. FTISU audit is the next step.

## 3. Dataset acquisition matrix

### A. Vietnamese and multilingual ASR — use all available for ASR

| Corpus | Reported size / supervision | Use |
|---|---|---|
| VLSP2023 | 300h, ASR + SER according to VLSP 2025 paper | ASR and inspect emotion annotations for SER |
| PhoAudiobook | 1,494h audio+text | Large-scale ASR; clean audiobook/read style |
| viVoice | 887,772 samples, 1,016.97h audio+text | Multi-speaker ASR |
| Viet_BUD500 | ~500h audio+text | Multi-domain/accent ASR |
| 28k_VigBigData | 460k utterances in VLSP paper | ASR after source/schema verification |
| ViMD | 100h audio+text | News/broadcast/regional ASR |
| VIVOS | 15h audio+text | ASR training/benchmark |
| FPT Open Speech Dataset | 25,921 samples, ~30h | ASR training/diagnostic |
| FLEURS vi_vn | official train/dev/test | train on train; dev for selection; test frozen |
| VietMed | 16h labeled, 1,000h unlabeled medical, 1,200h unlabeled general | ASR domain adaptation/representation learning |
| VietSuperSpeech | paper reports 267.39h; counts need reconciliation | pseudo-transcript ASR training with quality filter |
| GigaSpeech2 Vietnamese | 6,039h refined / 7,324h raw; human dev/test | large-scale ASR; refined first, raw as ablation |
| DataHive phone conversations | small public Vietnamese stereo phone sample, no transcript | channel robustness/diarization; not call-center QA |
| CALLFRIEND Vietnamese | 60 telephone calls, ~25h, 8kHz stereo | phone-channel/diarization if available in current Drive/access |

Sources:
- VLSP 2025 paper and data inventory: https://aclanthology.org/2025.vlsp-1.2.pdf
- FLEURS: https://huggingface.co/datasets/google/fleurs
- FOSD: https://data.mendeley.com/datasets/k9sxg2twv4/4
- PhoAudiobook: https://huggingface.co/datasets/thivux/phoaudiobook
- viVoice: https://huggingface.co/datasets/capleaf/viVoice
- Bud500: https://huggingface.co/datasets/linhtran92/viet_bud500
- GigaSpeech2: https://huggingface.co/datasets/speechcolab/gigaspeech2
- VietMed: https://aclanthology.org/2024.lrec-main.1509/
- VietSuperSpeech: https://huggingface.co/datasets/thanhnew2001/VietSuperSpeech
- VIVOS: https://huggingface.co/datasets/AILAB-VNUHCM/vivos
- VLSP resources: https://vlsp.org.vn/resources

PhoAudiobook and viVoice cards require accepting research access conditions. This is not a reason to exclude them: request/accept access using the academic route. GigaSpeech2 also has an access agreement because the provider does not own source audio. The project is non-commercial; do not spend time pursuing commercial licensing. Do not bypass access controls.

### B. Emotion datasets — use all in multi-corpus/multi-task SER

| Corpus | Language / labels | Role |
|---|---|---|
| ViSEC | Vietnamese, 4 classes | Main target SER head |
| LUCEE | Vietnamese, 4 classes | Human-reviewed transcript + audio fusion and adaptation |
| VNEMOS | Vietnamese, 5 original classes | Multi-corpus SER; retain fear as auxiliary class |
| IEMOCAP | English, multiple emotion labels | Cross-lingual auxiliary SER, session/speaker disjoint |
| EMO-DB | German, 7 classes | Cross-lingual auxiliary SER |
| RAVDESS | English, 7/8 speech labels depending protocol | Cross-lingual auxiliary SER; preserve calm separately |
| CREMA-D | English, 6 classes | Cross-lingual auxiliary SER |
| EmoV-DB | English, emotion labels | Cross-lingual auxiliary SER; inspect ontology |
| SentiV / VietSpeech | Vietnamese, 6 labels | Vietnamese auxiliary head; preserve original ontology |
| VLSP 2025 SER | Vietnamese, neutral/negative task | Binary auxiliary task, not four-class mapping |
| MELD_VIET archive | Drive ZIP, contents unknown | Inspect archive; use if it contains audio/text/emotion/dialogue labels |

The common four-class SER output remains neutral/happy/sad/angry. Other emotion labels are not thrown away: use corpus-specific heads or a hierarchical/multi-task loss, and only map a label to the common head when the annotation definition supports that mapping. Never turn binary negative into angry, fear into sad, or calm into neutral without an explicit experimental mapping and ablation.

Historical VNEMOS results from the old paper must be preserved as historical results. For the new multi-corpus experiment, use declared folds/cross-validation; do not continue calling a dataset a blind external test after using it in training or model selection.

### C. Conversation and call-centre workflow data

| Corpus | Available labels | Use |
|---|---|---|
| OneVoice | 1,200 synthetic Vietnamese calls, transcript, speaker/voice metadata, needs_attention | Call-level attention/topic baseline and end-to-end workflow demo |
| MELD_VIET archive | pending archive inspection | Potential conversational emotion/context dataset |
| DataHive phone sample | natural two-party stereo speech, no transcript | audio channel/diarization robustness |
| CALLFRIEND | natural telephone audio | telephone domain evaluation if access available |

OneVoice is synthetic and remains explicitly tagged synthetic in the product. It is still useful for academic workflow testing; no human-company partnership is required.

## 4. Download and use policy

- KLTN is academic/non-commercial: prioritize research-use datasets, including CC BY-NC-SA and gated academic datasets where access can be obtained. No commercial-license clearance is required for this thesis.
- Keep source attribution and access acknowledgements in the private dataset manifest. Do not bypass gated access or redistribute source audio.
- No new human/company data collection is a prerequisite. Existing public, research and synthetic corpora are sufficient to build the prototype and run academic experiments.
- The product demo must disclose source provenance: synthetic, acted, read speech, media, telephone, or conversational. Never describe synthetic OneVoice as real customer calls.
- Do not upload raw datasets, audio, transcripts, model weights or Drive credentials to the public product repository.

## 5. Speed vs data volume

More useful data can improve coverage and generalization, but does not automatically make inference faster. More training data increases training time. Inference latency is optimized separately by selecting a compact production model, batching, caching, quantization, efficient feature reuse and GPU serving. We will measure both quality and speed.

## 6. Acquisition status

The machine-readable inventory is data_pipeline/corpus_registry.json. The next FTISU run should:
1. restore the four SER backups plus MELD_VIET_CLEANED_DATA;
2. inventory the ZIP before extracting it;
3. run full audio/hash/metadata audit;
4. acquire the public/gated corpora listed above in task batches;
5. create one unified provenance manifest while preserving each source schema;
6. prepare multi-corpus folds and quality reports.

No model training begins until the data inventory is complete. No new human recordings or company access are required.
