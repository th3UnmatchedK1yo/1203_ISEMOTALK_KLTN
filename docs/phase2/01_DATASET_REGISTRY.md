# Phase 2 — Dataset registry and acquisition decision

Date: 2026-11-25. Research data preparation only. No new corpus has been downloaded to the GPU host by this change. Data access, license and commercial/model redistribution permission are distinct.

## Existing backups (read-only metadata inventory)
The four Drive folders were located and their immediate structure verified; all rows of the ViSEC CSV and LUCEE JSONL were inspected. No raw audio bytes were downloaded or rehashed from Drive during this inventory.

| Source | Observed metadata | Proposed role |
|---|---|---|
| ViSEC | 5,280 records; 3.1759 hours; happy 1,228, neutral 1,507, angry 1,466, sad 1,079; 146 known speaker IDs plus 2,217 ID=0 rows; north 1,336, central 326, south 3,618; no text in CSV | Strict known-speaker source development; quarantine unknown speaker for strict protocol; ASR transcripts separately |
| LUCEE / VI_FINAL | 701 approved rows, 8 speakers, 223 conversation IDs, 6 pair groups; 0.4165h; neutral 183, happy 180, sad 169, angry 169; all text nonempty; all 701 stored hash values distinct | Human-scripted source/adaptation; permissions required; do not treat export split=train as research split |
| VNEMOS | Five emotion directories; official paper 250 segments, 5 classes | Historical four-class external benchmark (exclude fear/anxiety); no training, no claim of speaker independence |
| IEMOCAP | Session1–5 exist | English cross-lingual auxiliary/research baseline; keep session separation; explicit label mapping |

LUCEE metadata speaker/conversation/pair graph has 6 connected components (185,139,95,95,94,93 rows). A random utterance split leaks related speakers/conversations. The component count is from metadata only and can change after audio dedup/QC. Historical data have already been exposed in paper experiments; development folds cannot be presented as a new blind target test.

## New-source priority

| ID / source | Data and label type | Decision / rights |
|---|---|---|
| FLEURS Vietnamese | Official ASR benchmark, human transcripts, read speech | P0 acquire evaluation split, CC BY 4.0; keep benchmark frozen and document upstream pretraining overlap. https://huggingface.co/datasets/google/fleurs |
| FOSD v4 | 25,921 recordings, ~30h, transcripts | P0 ASR development/diagnostic; check exact mirror/license, copyright notice and pretrained overlap. Original release CC BY 4.0 and FPT public-license terms: https://data.mendeley.com/datasets/k9sxg2twv4/4 |
| OneVoice | 1,200 synthetic Vietnamese calls, transcript, voice assignment, business labels | P0 research integration/weak business baseline only. CC BY-NC-SA 4.0; review cloned-voice/consent terms, no voice-reference download; do not mix with real customer test or production commercial training. https://huggingface.co/datasets/nhatminh/OneVoice |
| SentiV / VietSpeech | Six speech categories, labels/paired text, gated research access; underlying audio from VietSpeech batches 0–10 | P1 request access, audit exact source/license and IDs; no auto download. Anger includes disgust; enjoyment is not automatically happy in strict protocol; retain original labels, exclude incompatible samples or explicit sensitivity analysis. https://huggingface.co/ducdatit2002/sentiv |
| VLSP 2025 ASR/SER | neutral vs negative | P1 contact organizer for access/terms; separate binary task or auxiliary loss, never map negative to angry. https://vlsp.org.vn/vlsp2025/eval/asr-ser |
| CALLFRIEND Vietnamese | 60 natural two-channel 8 kHz telephone conversations, ~25h | P1 licensed via LDC; telephone/diarization diagnostic; no emotion or customer QA labels by default. https://catalog.ldc.upenn.edu/LDC96S60 |
| VietSuperSpeech | conversational ASR pseudo-transcripts from YouTube; paper 267.39h; card lists inconsistent counts/duration | P2 verify exact pinned revision, rights of upstream content and text quality; if permitted use for training diagnostics, not gold evaluation. https://arxiv.org/abs/2603.01894 ; https://huggingface.co/datasets/thanhnew2001/VietSuperSpeech |
| Target role-play corpus | new consented human conversations, independently annotated | P0 collect, never call real operational calls. |
| Target real corpus | authorized in-domain call recordings + QA/outcome evidence | P0 acquisition dependency, independent target evaluation essential; no public fully matching corpus verified. |

Official ViSEC source https://huggingface.co/datasets/hustep-lab/ViSEC (CC BY 4.0, 5,280 rows). VNEMOS paper https://scholar.vnu.edu.vn/entities/publication/c738af7e-7263-442e-9bd2-ae06bf1bbf22 (media clips; usage rights not established). IEMOCAP terms must be verified via USC corpus agreement. LUCEE consent/rights must be confirmed by research owner. No dataset or model may be redistributed simply because it is downloadable.

## Eligibility model

Track source revision, acquisition date, original license and evidence, permitted analysis/evaluation/training/commercial purposes, attribution, restrictions and revocation process. Local rights file is deny by default; example contains no approvals. User/operator must record actual permission, not type a placeholder. Check commercial rights for base encoders and model artifacts as well as datasets before commercial deployment. Training rights and product inference are separate.

No private audio, transcript, raw manifest, identity, credentials, Drive IDs or checkpoints in public Git. Reports and inventories produced on private storage. Pinned downloads and checksum logs only after permission review.
