# Inference and authentic research audit — 2026-11-22

Baseline web commit: `9f7ced37d7ddbf253bc7946c111662bc8732e785`. Implementation branch: `feat/thesis-demo-hardening-20261122`.

## Current conclusion

The laptop's previously working cached faster-whisper-small CPU INT8 path is preserved. This branch improves input contracts, memory bounds, readiness and package identity without changing ASR beam size or training a model. SER remains explicitly mock until an authentic factory and the complete feature pipeline pass the restoration gates.

**New archive evidence corrects the older recovery notes:** all nine historical H5 F4 head checkpoints are available in the uploaded main experiment archive. They were selectively restored outside the web repository and their bytes hashed. No checkpoint was deserialized or executed. A head's availability is different from a deployable raw-audio SER system.

## Findings and implemented corrections

| Finding | Evidence in baseline | Correction and verification |
|---|---|---|
| Config-only verification accepted replaced weights | `adapters/ser_checkpoint.py::read_verification`; replacing `model.pt` did not invalidate the record | Version 2 requires explicit asset hashes, factory/source identity, config hash, held-out manifest hash and evaluation audio hashes. Regression changes the actual file bytes. |
| Single-class evaluation could report macro-F1 1.0 | `verify.py::macro_f1` omitted classes without support | Fixed four-class macro-F1; nonempty manifest with every class required; finite threshold in `(0,1]`; invalid labels, repeated intervals and invalid times rejected before inference. |
| Serving could reuse a loaded model after package change | `_load()` returned cached object before verification | Full hashes before loading; cheap file identity/size/timestamp checks after loading; changed packages fail and require verification/restart. |
| Weights could change between full hash validation and fingerprint capture | Independent review reproduced replacement after validation but before factory loading | Capture identity before either full hash pass; compare after validation and after load. Regression rejects the interleaving and leaves loaded/verified false. |
| Large compressed audio was decoded before duration rejection | `service.py::_load`, called by probe, decoded before Node checked duration | Finite metadata, duration and decoded-size preflight; bounded PCM reader; default 256 MiB retained cache budget. Oversize output is rejected rather than silently truncated. |
| Concurrent cold requests decoded the same file twice | Cache lock protected only lookup/assignment | Cold decoding is serialized and cache identity includes file size. A two-request regression confirms one decode. |
| Stereo statistics made full-length float64 copies | `audio.py::channel_split_is_reliable` | At most 64,000 evenly spaced frames used for this heuristic; memory regression checks temporary allocation on one million frames. |
| Reversed/infinite timestamps and overflowing probability sums | `SegmentIn`, `normalize_probs` | Finite, ordered intervals within audio; strict four-probability contract; non-finite JSON returns controlled HTTP 422 rather than a JSON-serialization HTTP 500. |
| Web slices silently added surrounding speech | Service extended clips shorter than 0.3 s while verifier used exact intervals | Service now supplies the requested slice. Research-specific padding belongs to the factory. Regression: a 0.1 s clip remains 1,600 samples, instead of 4,802. |
| Cache presence was described as readiness without load outcome | `FasterWhisperAsr.status()` | Optional `loaded` health field; explicit `/v1/warmup` initializes the running cached ASR only; errors remain visible. No weight downloads. |
| Anonymous first speaker was assigned agent role | `PyannoteDiarizer.diarize()` | Role remains unknown; manual roles are preserved by the backend. A diarized speaker cluster is not evidence of business role. |
| Completed results lacked adapter evidence | Transcribe/diarize/emotion responses | Additive `evidence: {adapter, model?, device?, mock, verified?}` reflects the actual completed stage. Missing unimodal outputs stay null. |

The proposed async health defect was **not present**: FastAPI routes were already synchronous `def`, which runs blocking work outside the ASGI event loop. A controlled test held a transcription worker while health returned HTTP 200 in 2.22 ms. That is a synthetic orchestration check, not real ASR latency. The existing route style is retained.

## Verification executed here

The baseline seven offline tests passed before changes. The expanded lightweight suite passed **34 tests** after the independent-review race fix:

```bash
cd inference
python -m unittest discover -s tests -p 'test_*.py' -v
```

Environment: container Python 3.12, NumPy, FastAPI, httpx and installed FFmpeg/FFprobe. Tests use temporary synthetic WAVs and clearly synthetic factory/weight fixtures. `torch` and `faster_whisper` are absent in this container. No real ASR/SER inference, Windows CUDA check, model accuracy measurement or GPU throughput benchmark was performed here. CI requires `inference/requirements-test.txt` and FFmpeg/FFprobe.

Before demonstrating on the actual laptop, initialize the running ASR, transcribe a consented short Vietnamese clip twice, compare recognized words with the recording, and measure cold/warm elapsed time and process memory. SER labels must remain marked mock until genuine restoration is complete. Decoder/cache limits are not a limit on total process RSS.

## Fresh archive verification

Inspected archive: `SER_EXPERIMENT_BACKUP_20261007.tar(2).gz`, 339,570,624 bytes. SHA256:

```text
ff1946b431f27224f141c021f0a621dfa807bf24e76f7014c7202de90ac1d593
```

Within `.worktrees/ser-q1-t1-t3/artifacts/h5/`, the following nine files are each 5,796,631 bytes. Model SHA256 values matched the adjacent `RESULT.json`. Every metadata SHA256 also matched, and each C0/M1 parent reference matched the corresponding M0 bytes. Total head bytes: 52,169,679 (about 49.75 MiB). Only `model.pt`, `metadata.json` and `RESULT.json` for these heads were extracted; no raw datasets or broad environment restore.

| Condition | Seed | Model SHA256 |
|---|---:|---|
| M0 | 13 | `fce6f32da9815e990595a5eac4ec8211ce0cac18536b926655ab11d76eeb0ffb` |
| M0 | 42 | `534553b32232e4b971c0b5642ebc0ad7507fd2daad0ded2fa94fb51cf8654252` |
| M0 | 2026 | `f49dd708f99e45346f7f24a21d6a07611091970a80af65d4bcc52f1fe1b20e7a` |
| C0 | 13 | `930b8a524afd063198708561b0a4ce286c8413192cd420116972ca21e1539cc0` |
| C0 | 42 | `c58fba4978a643dc12622eda68c609640a2b1592acf75bb98c6de063381c42a1` |
| C0 | 2026 | `926d0531f12a3483a4001f2d595ffd483d07ac392124259312d5e3e60a6185fe` |
| M1 | 13 | `4717f3ffeb53f74fcc31f53b0f3a785b06437e19efe9d57dc73864b4b7203803` |
| M1 | 42 | `5b2a3983ed18372563103efc9be8a3604bb33c2f3cc66064ce8c029cb0c812b0` |
| M1 | 2026 | `88064912bc3ae14b576dd65139754c7ae3b48ae4db68935bc747438a34554a01` |

M0 path pattern: `m0_f4_secondary_v2__0c72a71a/SEEDS/seed_<seed>/model.pt`. Continuation path pattern: `continuation_f4_secondary_v2__7c43afd0/CONDITIONS/<C0|M1>/seed_<seed>/model.pt`.

Metadata identifies `CrossAttentionFusion`, the canonical four labels, hidden dimension 256 and dropout 0.2. M0 records five epochs over 5,280 source examples; C0/M1 record two continuation epochs with 5,280 draws per epoch. These are inspected historical metadata, not newly reproduced training or evaluation results.

### Do not conflate October heads with later reviewer sensitivity runs

The source at `review/rivf2026-camera-ready-evidence` / `e89f1542`, `scripts/reviewer_h5_three_arm_newlineage.py`, explicitly describes a prospective experiment on new 2026-11-09 features. It reuses historical M0 initializations, declares the original feature manifests missing, and distinguishes new C0/M1/C0_CM continuation from recovery of archived C0/M1. Thus matching the October archive hashes is necessary evidence about those archived heads, but does not establish that they are the weights for every later camera-ready result. No new continuation/training was run in this audit.

## Research models and exact dependencies

Sources below were read from the private repository `th3UnmatchedK1yo/SER_VI_TRANSFER`, primarily commit `e89f1542`. Links require access. The older `feat/ser-q1-t1-t3` README was also inspected; it explicitly separates historical protocols from its then-current protocol. The paper and implementation should be cited at their actual frozen lineage.

### F1: frozen XLS-R + XLM-R linear models

- [Common feature builder](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/scripts/build_serq1_common_features.py): XLS-R-300m revision `1a640f32ac3e39899438a2931f9924c02f080a54`, layer 24, 1,024-dimensional frames, 2,048-dimensional mean/std pooled audio. XLM-R-base revision `e73636d4f797dec63c3081bb6ed5c7b0bb3f2089`, layer 12, 768-dimensional text, maximum 512 tokens.
- [Linear models](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/src/serq1/models/linear.py): train-fitted StandardScaler and balanced logistic regression for concatenated pooled fusion; separate `LinearProbe` class for genuine unimodal models. Each fitted head/scaler must actually be available to show its predictions.

### B2: emotion2vec + TF-IDF logistic fusion

- [Legacy-compatible B2 feature space](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/src/serq1/b2_legacy.py): frozen emotion2vec embedding, train-fitted audio scaler and row L2 normalization; word TF-IDF with n-grams 1–2, min_df 2, maximum 20,000 features, sublinear TF and L2 text normalization; sparse concatenation and balanced logistic regression.
- The fitted scaler, exact representation, vocabulary, IDF and classifier are needed. A fresh vectorizer fitted on demo calls is a different model. A B2 serving package was not established by the nine F4 head files.

### F4/H5: emotion2vec + PhoBERT cross-attention

- [Feature specification](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/src/serq1/features/secondary.py) pins emotion2vec-base revision `0c9a3152734f9d7a7a05b4ee6bfb3c109d288664`, checkpoint SHA256 `4f14ddf7ba394bcafdd4bff6ae0f24ab2e4134260d4dd42c58ea791a201b02dd`, FunASR 1.4.2 / ModelScope 1.39.1 in the recorded environment. PhoBERT-base-v2 revision is `e2375d266bdf39c6e8e9a87af16a5da3190b0cc8`; the recorded Transformers version is 5.15.0.
- Features are 768-dimensional emotion2vec frames and PhoBERT tokens, maximum 64 text tokens, active special tokens included. Temporal tokens are cached float16; pooled summaries are float32. The [builder](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/scripts/build_serq1_secondary_features.py) loads 16 kHz audio with soundfile/torchaudio and uses explicit offline PhoBERT loading.
- [CrossAttentionFusion](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/src/serq1/models/cross_attention.py) uses projections to 256, four attention heads in each direction, gated cross-modal contexts and interaction `[a; t; |a-t|; a*t]`. It has one fused classifier, not separate acoustic/lexical emotion heads.
- [H5 loader](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/src/serq1/h5_prediction.py) checks checkpoint SHA256, reconstructs training architecture from metadata, uses `torch.load(..., weights_only=True)` and strict state loading. Its inputs are cached feature sequences. It does not itself implement the web raw-waveform serving factory.
- [H5 writer](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f1542/src/serq1/h5_m0.py) saves fusion-head state and metadata, not pretrained encoder weights.

F1, B2 and F4 are distinct families. They must not be labeled respectively as the acoustic, lexical and fused outputs of one deployed model.

### ASR identity

The inspected secondary feature specification pins `vinai/PhoWhisper-base`, revision `7ebdb9e88f5cc5271fb88f4d642c82ff9388650e`. The laptop demo uses general-purpose `Systran/faster-whisper-small` in CTranslate2. These are different ASR pipelines. Merely running real ASR does not produce real emotion predictions or reproduce the paper's frozen text axis.

## Remaining restoration gates

1. Select and document the genuine deployment condition/seed or ensemble and its lineage. No requirement to upload the same nine historical head files again was established by this inspection.
2. Confirm pinned emotion2vec/PhoBERT backbones, tokenizer assets and source dependencies on the actual laptop. This container has no ML runtime/backbone restoration; none was downloaded.
3. Implement the raw-waveform factory using authentic research code and feature conventions. Return unavailable acoustic/lexical outputs as null. Keep all private files outside the public web tree.
4. Establish numerical feature/prediction equivalence on available reference utterances, accounting for FFmpeg versus research resampling, transcript source, token truncation and feature precision. Historical missing feature manifests limit what can be claimed.
5. Run the explicit package check and genuine four-class held-out sanity evaluation, with independently justified thresholds. Then measure latency/memory on the laptop. Existing 4 GB VRAM and historical free disk reports are constraints, not fresh measurements.
6. Evaluate representative call-center recordings separately, including ASR mistakes, unknown speakers, overlap and reviewer corrections. Benchmark performance is not a calibrated customer dissatisfaction probability.

See [SER_PACKAGE_VERIFICATION.md](../SER_PACKAGE_VERIFICATION.md) for the package schema and dry-run command, and [OFFLINE_ASR_SETUP.md](../OFFLINE_ASR_SETUP.md) for explicit server initialization and resource limits.
