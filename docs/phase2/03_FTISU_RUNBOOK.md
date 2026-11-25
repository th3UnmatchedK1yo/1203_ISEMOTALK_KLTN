# Phase 2 — FTISU data acquisition and audit runbook (revised)

Scope: acquire and audit all accessible research datasets for the KLTN. No commercial deployment is planned. No human/company data collection is required. Keep the research repository unchanged and all raw data outside Git.

## 1. Separate environment and preflight

    ssh ftisu
    nvidia-smi
    df -h "$HOME"
    python3 --version
    command -v rclone
    command -v ffmpeg
    command -v unzip
    rclone listremotes

Create a separate product checkout:

    git clone --branch feat/phase2-data-foundation-20261125 --single-branch https://github.com/th3UnmatchedK1yo/1203_ISEMOTALK_KLTN.git ~/isemotalk-phase2-code
    cd ~/isemotalk-phase2-code
    umask 077
    mkdir -p ~/isemotalk-private-data
    python3 -m unittest data_pipeline.test_audit -v
    python3 -m unittest data_pipeline.test_inspect_archive -v
    bash -n scripts/phase2_restore_data.sh

## 2. Restore existing Drive backups, including MELD-VIET

Use the configured rclone remote. Do not paste remote credentials or tokens. Dry-run first:

    rclone lsf DRIVE_REMOTE:SER_BACKUP_20260928 --dirs-only
    rclone lsf DRIVE_REMOTE:MELD_VIET_CLEANED_DATA
    bash scripts/phase2_restore_data.sh DRIVE_REMOTE:SER_BACKUP_20260928 "$HOME/isemotalk-private-data/raw"

Execute the copy only after checking the dry-run:

    bash scripts/phase2_restore_data.sh DRIVE_REMOTE:SER_BACKUP_20260928 "$HOME/isemotalk-private-data/raw" --execute
    bash scripts/phase2_restore_data.sh DRIVE_REMOTE:MELD_VIET_CLEANED_DATA "$HOME/isemotalk-private-data/raw" --execute

The script uses copy/immutable/check, not sync/delete. Existing data is not overwritten.

## 3. Inspect the 1.19GB MELD-VIET archive before extraction

    python3 data_pipeline/inspect_archive.py \
      --archive "$HOME/isemotalk-private-data/raw/MELD_VIET_CLEANED_DATA/stage_04_synthetic_technical_clean.zip" \
      --out "$HOME/isemotalk-private-data/meld-viet-archive-report.json"

This reads the ZIP directory and small metadata files only; it does not extract audio. Inspect the JSON report (entry counts, extensions, top-level folders, metadata schema candidates, archive checksum). Only after confirming the contents and free disk should you extract into a new versioned private folder. Never assume the archive is SER or call-center data from its name alone.

## 4. Run full audit on the four existing SER corpora

    python3 -m data_pipeline.audit audit \
      --root "$HOME/isemotalk-private-data/raw" \
      --out "$HOME/isemotalk-private-data/audit-v1"

Expected raw tree names:
- VISEC/data.csv + wavs/
- VI_FINAL_TRAINING_20260913_144031/TEXT/utterances.jsonl + AUDIO/
- VNEMOS/{angry,fear,happiness,neutral,sadness}/
- IEMOCAP/Session1..5/

The audit validates WAV PCM frames, duration, checksums where source manifests provide them, class/source counts and group metadata. It is read-only. If audio is compressed or unsupported, create explicit derivative manifests after ffmpeg conversion; do not silently drop.

## 5. Acquire public/gated datasets in task batches

Create an isolated CPU data environment:

    python3 -m venv "$HOME/isemotalk-private-data/venv"
    source "$HOME/isemotalk-private-data/venv/bin/activate"
    python -m pip install --upgrade huggingface_hub pyarrow lhotse soundfile
    hf auth login

Accept research access terms on the dataset page using the academic route where required. This is not commercial licensing; it is access authorization. Do not bypass gates.

### ASR batch
Use data_pipeline/corpus_registry.json. Acquire in this order:
1. FLEURS vi_vn train/dev/test (train for training, dev for selection, test frozen).
2. FOSD, VIVOS and Bud500.
3. PhoAudiobook and viVoice after account access approval.
4. ViMD, VLSP2023, 28k_VigBigData from VLSP resources if available.
5. VietMed labeled and permitted unlabeled splits.
6. VietSuperSpeech and GigaSpeech2 (refined first, raw as a separate experiment).
Do not download all giant corpora into the same folder; pin each dataset revision and keep source manifests. Keep official dev/test intact. Use streaming/sharded download when available and monitor disk.

### SER batch
Acquire RAVDESS speech, CREMA-D, EMO-DB, EmoV-DB, SentiV and VLSP SER sources in addition to the existing ViSEC/LUCEE/VNEMOS/IEMOCAP. Keep all original labels. Some sources require a gated research acknowledgement or institutional email. If the dataset is already present in the Drive backup, audit that copy instead of downloading a duplicate.

### Conversation/phone batch
1. Download OneVoice metadata and then audio using the existing pinned downloader on the remote-GPU branch or copy the script into this branch after review.
2. Use the existing DataHive phone-sample downloader from the remote-GPU branch for a bounded sample if useful.
3. Acquire CALLFRIEND only if the corpus is already available to the user/institution; otherwise keep it as optional and proceed with the available phone data.
4. Inspect MELD-VIET archive and include it if schema/audio/labels support a task.

## 6. Unified manifest and folds

- Run one adapter per source; preserve original schema and label ontology.
- Generate a single inventory with namespaced sample IDs, source revision, raw file hash, PCM hash, audio format, duration, language, speaker/session/conversation IDs, original label, normalized label (nullable), transcript and its provenance, task, split and QC status.
- Exact duplicates are linked across corpora. Near duplicates/script reuse is a separate audit.
- ViSEC: 5 grouped development folds on known speakers; speaker_id=0 is retained in inventory and can contribute to non-speaker-disjoint training/diagnostics but not claimed speaker-disjoint evaluation.
- LUCEE: leave-one-connected-component-out using speaker+conversation+pair links.
- IEMOCAP: session-disjoint cross-validation.
- VNEMOS and other small corpora: grouped cross-validation and per-corpus reporting. Preserve historical paper results separately.
- ASR: use each source's official split when provided; otherwise speaker/source-group split. Never use a held-out test for training.
- OneVoice: split by voice/script group; synthetic-only label.
- All rows are assigned to a declared role; a test row is used for evaluation, not training, so it is still used.

## 7. Return only sanitized audit summaries

Send back aggregate report.json sections, archive report summary, failed-file counts, class counts and disk/GPU status. Do not send raw audio, full transcripts, personal identifiers, access tokens, rclone config or private source paths. Phase 3 starts after the source inventory and acquisition report are complete; no model training is performed by the Phase 2 audit command.
