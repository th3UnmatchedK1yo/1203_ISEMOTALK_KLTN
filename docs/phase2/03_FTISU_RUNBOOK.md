# Phase 2 — FTISU runbook (operator executes)

No remote SSH shell access was available in the authoring session. Do not claim data transfer or GPU execution from these commands. Use the existing SSH alias on your own computer. Keep the research repo unchanged.

## 1. Separate workspace, preflight

On the workstation:
```bash
ssh ftisu
```
On the server:
```bash
nvidia-smi
df -h "$HOME"
python3 --version
command -v rclone
command -v ffmpeg
rclone listremotes
```
Confirm account permissions, quota and storage, not just GPU availability. Use an approved private workspace and do not paste credentials or remote config.

Clone a separate product checkout (do not switch a working research directory):
```bash
git clone --branch feat/phase2-data-foundation-20261125 --single-branch https://github.com/th3UnmatchedK1yo/1203_ISEMOTALK_KLTN.git ~/isemotalk-phase2-code
cd ~/isemotalk-phase2-code
umask 077
mkdir -p ~/isemotalk-private-data
python3 -m unittest data_pipeline.test_audit -v
bash -n scripts/phase2_restore_data.sh
```
Use Python >=3.10. Tests use synthetic WAV fixtures, no real audio or GPU.

## 2. Restore the four backup corpora

Replace DRIVE_REMOTE with the actual approved configured rclone remote, not an assumed name. Do not paste token or configure public sharing. Verify the folder via rclone lsf, then default dry run:
```bash
rclone lsf DRIVE_REMOTE:SER_BACKUP_20260928 --dirs-only
bash scripts/phase2_restore_data.sh DRIVE_REMOTE:SER_BACKUP_20260928 "$HOME/isemotalk-private-data/raw"
```
If the plan is correct, execute explicitly (copy + immutable + one-way check, never sync/delete):
```bash
bash scripts/phase2_restore_data.sh DRIVE_REMOTE:SER_BACKUP_20260928 "$HOME/isemotalk-private-data/raw" --execute
python3 -m data_pipeline.audit audit --root "$HOME/isemotalk-private-data/raw" --out "$HOME/isemotalk-private-data/audit-v1"
```
Audit outputs private inventory.jsonl and report.json. It does not change originals. A nonzero exit means fix listed issues before proceeding; use a NEW output directory to repeat. It audits WAV PCM; unsupported formats require explicit conversion/derivative provenance. No need to re-upload backup if Drive restored successfully. Keep hashes and rclone checks locally. Do not send raw transcripts/identifiers to GitHub.

## 3. Additional datasets (conditional on license/permission)

Reuse existing pinned download scripts after checking their behavior. Create isolated data venv, not the current GPU inference venv:
```bash
python3 -m venv "$HOME/isemotalk-private-data/venv"
source "$HOME/isemotalk-private-data/venv/bin/activate"
python -m pip install huggingface_hub pyarrow
```
For FLEURS evaluation, existing downloader can attempt a full Vietnamese test split (not the default 64-item smoke):
```bash
python inference/scripts/download_asr_benchmarks.py --dataset fleurs-vi-test --limit 2000 --output "$HOME/isemotalk-private-data/fleurs-vi-test"
```
Check actual manifest count, source split/revision/hash and audio/text; if upstream file layout changed, stop and correct selector. FOSD exact release and SentiV/VietSpeech/VLSP/CALLFRIEND rights/access must be confirmed before downloads. Do not download 60+ GB conversational data blindly.

If authorized for noncommercial research and clone-voice dataset terms reviewed, download OneVoice metadata first:
```bash
python inference/scripts/download_onevoice.py --output "$HOME/isemotalk-private-data/raw/OneVoice"
```
Existing script pins revision and avoids cloning reference clips. After metadata/rights inspection, explicit --all-audio to acquire the synthetic corpus if needed. Then audit separately:
```bash
python3 -m data_pipeline.audit audit --sources onevoice --root "$HOME/isemotalk-private-data/raw" --out "$HOME/isemotalk-private-data/onevoice-audit-v1"
```
Metadata-only output does NOT count as audio availability or pilot data.

## 4. Freeze development folds only after review

Copy the deny-by-default template privately and fill real rights evidence; never enter made-up approvals:
```bash
cp data_pipeline/rights.example.json "$HOME/isemotalk-private-data/rights.json"
```
After audit pass and rights approval:
```bash
python3 -m data_pipeline.audit folds --inventory "$HOME/isemotalk-private-data/audit-v1" --out "$HOME/isemotalk-private-data/devfolds-v1" --rights "$HOME/isemotalk-private-data/rights.json" --sources visec lucee
```
This does not train or produce a new independent test. It verifies inventory hash and permissions and excludes exact duplicate/unknown/ineligible samples; near duplicate and cross-source speaker/script checks plus ASR text preparation still required. If a fold lacks class support the tool refuses to generate it. Keep historical paper protocol separate.

Send back only sanitized report.json aggregate statistics, error codes and split_report summary; remove private source paths/rights refs if present. Do not send recordings, identifiers, transcript or tokens. Phase 3 remains gated until real audit evidence and target holdout/annotation plan are approved.
