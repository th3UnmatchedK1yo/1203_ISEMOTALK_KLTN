# Authentic SER package verification

Updated 2026-11-23. This is a deployment identity and four-class sanity gate. It does not reproduce the paper's experiments, establish held-out independence by itself, or measure accuracy on call-center recordings.

## What is now available

The uploaded October experiment archive contains all nine historical H5 F4 fusion heads: M0/C0/M1 × seeds 13/42/2026. Their model and metadata hashes were checked against the archived `RESULT.json` records. Head availability does not restore the pretrained emotion2vec/PhoBERT feature pipeline. See [the source and recovery audit](audits/inference-research-20261122.md) for exact identities and the historical/new-feature-lineage distinction.

The default demo still uses mock SER. Do not change `ISEMO_SER=checkpoint` merely because a `model.pt` has been found.

On 2026-11-23 the nine local head hashes were checked again, the exact historical research source was reachable through the connected private repository, and the connected Drive backup exposed IEMOCAP/VISEC/VNEMOS/VI_FINAL_TRAINING directories. Do not ask the user to re-upload those assets or implement the serving factory. Recovering the authentic dependency set and writing that wrapper are implementation work. Backbone/tokenizer bytes on the deployment laptop, exact reference-feature availability and measured runtime readiness remain unverified. Existing archive examples are not automatically an independent held-out evaluation set. See [current status and responsibilities](PROJECT_STATUS_20261123.md).

## Private package contract

An authentic private `build_model(config)` factory must return an object with `predict(waveform, text, speaker)`. The waveform is the requested utterance only, mono float32 at 16 kHz. Any architecture-specific padding belongs in the factory. Return four probabilities summing to one in the declared label order; do not return logits. Return missing unimodal outputs as `None` rather than inventing them. The restored F4 head has only a fused classifier.

The private JSON configuration must declare every required source, weight, tokenizer, preprocessing and metadata file. Paths are relative to the configuration directory, unless absolute. Each entry is a file, not a directory. Hash the actual bytes with PowerShell `Get-FileHash -Algorithm SHA256`; copy the lowercase digest. No hashes or architecture are inferred from filenames.

```json
{
  "labels": ["neutral", "happy", "sad", "angry"],
  "factorySource": "serving.py",
  "artifacts": [
    {"path": "serving.py", "sha256": "REPLACE_WITH_ACTUAL_LOWERCASE_SHA256", "role": "code"},
    {"path": "model.pt", "sha256": "REPLACE_WITH_ACTUAL_LOWERCASE_SHA256", "role": "weights"},
    {"path": "metadata.json", "sha256": "REPLACE_WITH_ACTUAL_LOWERCASE_SHA256", "role": "metadata"}
  ]
}
```

This abbreviated example deliberately contains invalid placeholder hashes and is not an operational F4 package. A real package must also declare the exact backbone files, tokenizer files, feature configuration and all serving source dependencies. The checker cannot discover undeclared dependencies automatically. `factorySource` must be declared with `role=code`; at least one file must have `role=weights`. The imported factory's source path must match `factorySource`.

Set these in the private `inference/.env` only when that package exists:

```dotenv
ISEMO_SER=checkpoint
ISEMO_SER_FACTORY=serving:build_model
ISEMO_SER_CONFIG=C:/private/ser/ser_config.json
ISEMO_ALLOW_UNVERIFIED=0
```

Keep weights, evaluation audio, transcripts, private source and generated verification records outside the public web repository. Do not enable the debugging bypass for a demonstration.

## Check local inputs before running inference

Use a JSONL manifest with genuine held-out labels and every canonical class represented. Relative audio paths are resolved against the manifest's directory. Audio/interval pairs must be unique; timestamps must be finite, increasing and within the recording. A manifest containing one easy class is rejected. Dataset split independence, speaker/corpus boundaries and scientific sample size remain the researcher's responsibility.

```json
{"audio":"heldout/clip.wav","start":0.0,"end":2.5,"text":"actual transcript","label":"sad","speaker":"unknown"}
```

From the `inference` directory, using the existing virtual environment:

```powershell
.\.venv\Scripts\python -m app.verify --manifest C:/private/ser/eval.jsonl --min-macro-f1 0.60 --check-only
```

Choose the threshold from a documented evaluation objective. `0.60` here illustrates command syntax; it is not a paper result or a recommended acceptance threshold. `--check-only` validates the manifest, probes audio and checks declared file hashes. It does not import the factory, initialize ML models, run predictions or write `verification.json`.

After the offline factory and feature equivalence have been established, remove `--check-only` to run the sanity evaluation. Full verification hashes declared artifacts, the manifest and every evaluation audio file; checks actual four-class probabilities; and writes a version-2 verification record atomically. Failed scores cannot pass the gate. Invalid input never creates a passing record.

Legacy config-only verification records are rejected. Changing the factory, configuration, declared assets or evaluation files requires verification again. Restart the service after a package change. Initial model loading checks full file hashes; subsequent requests and health polling use file identity/size/timestamp checks to detect changes without repeatedly hashing large backbones. This is an integrity control in the trusted local environment, not a signed attestation against a hostile process.

## Health semantics

- `ready=true, loaded=false, verified=false` for a checkpoint means a structurally valid package and evaluation record are configured; model loading and full runtime hash checks have not run in this process.
- `loaded=true, verified=true` means that package passed the integrity/sanity gate and was loaded. It does not mean the application reproduced the paper or has known call-center accuracy.
- Response `evidence` records the adapter used by the completed stage. Historical records are not filled from the current health endpoint.

## Restoring F4 without changing the experiment

1. Select a documented condition/seed or the original ensemble policy. The October C0/M1 heads and the later reviewer sensitivity runs are different lineages; do not substitute one for the other.
2. Restore the exact research source and matching metadata. Use `src/serq1/h5_prediction.py::load_f4_checkpoint`, strict state loading and the archived SHA256; do not guess an architecture.
3. Restore pinned emotion2vec-base and PhoBERT-base-v2 assets. Preserve 16 kHz audio handling, raw emotion2vec frame features, PhoBERT tokenization/truncation, active special tokens and feature dtypes.
4. Compare newly extracted features and held-out predictions with available original reference artifacts. The generic web decoder uses FFmpeg, while the research builder uses soundfile/torchaudio; numerical equivalence must be measured before claiming reproduction.
5. Measure cold-load time, warm utterance latency, RAM and VRAM on the actual RTX 3050 laptop. Keep cached faster-whisper-small on CPU INT8 and one worker. No claim that both SER backbones fit concurrently in 4 GB VRAM has been established.
6. Evaluate representative consented call recordings separately. Preserve original text, speaker attribution and model identity when reviewers correct the output. No retraining is required for this restoration sequence.
