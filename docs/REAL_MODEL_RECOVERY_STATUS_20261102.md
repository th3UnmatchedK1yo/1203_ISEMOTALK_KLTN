# ISEmoTalk: real-model recovery status, 2026-11-02

## What has been verified

The user's local system reports:
- Express API: healthy.
- FastAPI: healthy and reachable.
- FFmpeg/FFprobe: present.
- Device: CPU because PyTorch is not installed in the inference venv.
- ASR adapter: mock (not speech recognition).
- Diarization adapter: mock (not speaker attribution).
- SER adapter: mock, verified=false.

An uploaded recording, CALL-0014, played as a genuine 2-second audio clip in the UI but showed mock transcript and mock emotions. No claim of trained model inference can be made for that output.

## Research backup inventory based on October handoff

The user supplied:
- SER_EXPERIMENT_BACKUP_20261007.tar.gz: main experiment state and some project-trained weights (including cp13 projector .pt examples), plus source/config/reports.
- SER_GIT_ALL_REFS_FINAL_20261007.bundle: final code/history of research branches.
- SER_FINAL_LEFTOVERS_20261007.tar.gz: non-Git and embedded-repo remnants.
- SER_GIT_ALL_REFS_20261007.bundle: older superseded code bundle.
- SER_BACKUP_HANDOFF_20261007.md: provenance and recovery manifest.
- A short real WAV sample with a name containing the dataset label 'sad'. This filename is *not* evidence of a verified model prediction.

**IMPORTANT MISSING FILE:** SER_WORKTREE_RESULTS_20261007.tar.gz was NOT included among the uploaded archives in this session. According to the handoff, this ~785 MB archive contains the nine H5 model.pt checkpoints and supporting V5/Q1-T1-T3 artifacts and results. Do not assume the other archives contain these exact worktree files.

Pretrained upstream encoders such as XLS-R/emotion2vec and the original Linux venv were explicitly *excluded* from the October archives and may need restoration or version-compatible download after checking available disk space. Raw datasets live separately under Google Drive SER_BACKUP_20260928 (VI_FINAL/VNEMOS/VISEC/IEMOCAP). **Do not download the full Drive datasets for web inference.**

The uploaded archives have not yet been verified/extracted in this web repository. The exact weight architecture, preprocessing, checkpoint schema, label mapping and appropriate model selection must still be checked before deploying SER.

## Safe next action on Windows

Run in PowerShell at the ISEmoTalk project root:

    git fetch origin
    git switch feat/readability-theme-20261102
    git pull --ff-only origin feat/readability-theme-20261102
    powershell -ExecutionPolicy Bypass -File scripts/diagnose-ser-local.ps1

The diagnostic script is read-only: no downloads, extraction, cache cleanup or database edits. If your backup files are outside Downloads, pass -BackupDir with the correct folder.

Send the output showing free disk space, GPU VRAM, cache folders and whether SER_WORKTREE_RESULTS archive is present. If found, the script prints paths of H5 model.pt files from the archive without extraction.

## Integration sequence (do not retrain the paper)

1. Select research checkpoint and identify its exact training branch/config, intended conditions and proper preprocessing.
2. Confirm pretrained backbone availability, CPU/GPU memory and local free disk.
3. Restore only the needed trained weights, source and label mapping, not all the research outputs or raw datasets.
4. Implement the existing CheckpointSer serving-factory interface using the authentic research model class.
5. Run held-out sanity/evaluation tests; validate both checkpoint hashes and config version. Do not use ISEMO_ALLOW_UNVERIFIED=1 for a defense.
6. For real transcripts, install a compatible PhoWhisper model only after checking caches, dependencies and resource constraints. The public vinai/PhoWhisper-small model is a separate ASR model and was not bundled into the SER backup.
7. Validate short clips, full call recordings, and out-of-domain call-center utterances separately.
8. Only then change the production status from mock to real, preserving provenance in the DB.

## UI status

The read-only UI refresh is on branch feat/readability-theme-20261102: Ocean theme (navy/teal, off-white), readable larger text and stronger contrast with a wider laptop workspace. It changes no SQLite data and performs no ML inference.
