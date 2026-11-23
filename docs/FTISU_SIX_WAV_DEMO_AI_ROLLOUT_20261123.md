# ISEmoTalk: six-WAV demonstration and safe FTISU model rollout

Updated 2026-11-23. All commands below are for the student-operated FTISU
terminal unless explicitly marked Windows. The GitHub repository contains
code, not the user's private models. CI passing is NOT real GPU validation.

## Demo script — Vietnamese spoken language

"Thưa thầy, em dùng sáu file ghi âm cuộc gọi để minh họa phân tích tự động
trên máy chủ FTISU. Em tải toàn bộ lên Chạy AI, chờ hệ thống hoàn thành
ASR rồi XLM-R sàng lọc văn bản. Trên Hàng đợi cuộc gọi, em chọn cuộc
cần nghe trước và mở mốc thời gian để đối chiếu âm thanh.

Điểm XLM-R là chỉ số sàng lọc từ dữ liệu OneVoice tổng hợp, chưa phải
điểm chất lượng dịch vụ hay cảm xúc. Nếu đã kích hoạt diarization, em chỉ
có thể nói AI nhận diện nhóm giọng A/B; muốn biết ai là nhân viên và
khách hàng phải có thêm bằng chứng hoặc QA xác nhận.

Nếu checkpoint F4 thực sự đã xác minh, ISEmoTalk biểu diễn nhãn cảm xúc
theo thời gian riêng cho người đã xác định vai trò. LLM local đề xuất
nguyên nhân và cách coaching, mỗi kết luận gắn đoạn âm thanh nghe lại.
Người QA dùng 5 tiêu chí có bằng chứng để ra kết luận và giao việc tiếp.
Nghiên cứu tiếp theo của em kiểm tra SER có giúp tìm đúng cuộc gọi cần
QA tốt hơn baseline chỉ dùng transcript hay không."

Do not pretend that all of the optional components have been activated
when they have not. XLM-R value 0.0767 / 1 is not a 7.67/100 quality
grade. It does not mean the employee did anything wrong.

## The six-WAV live sequence

1. From Windows double-click ISEmoTalk.cmd, open
   http://127.0.0.1:5174/scan.
2. Select call_01.wav ... call_06.wav; start the batch.
3. Show the actual progress, ASR failures if any, and XLM-R results.
4. Open /calls and select a completed real-audio call.
5. In detail, play audio and click transcript timestamps. If PhoWhisper
   shows audio_window, that is a rough audio range, not exact word
   alignment or an agent/customer speaker turn.
6. When Community-1 is really configured, show anonymous Voice A/B,
   select a clearly separated segment and confirm agent/customer roles
   using audio. Mixed windows stay unknown.
7. When F4 stage evidence says verified, open the real emotion timeline;
   otherwise explain clearly the step is missing. A text-only XLM-R
   classifier must not be described as a SER model.
8. When local Qwen is running, click "Phân tích bằng LLM", then an
   evidence timestamp, and play the supporting audio. This suggestion
   is not automatically saved as human QA.
9. Expand the human 5-criterion rubric. Choose evidence and verdicts,
   attach policy/CRM notes if available, then click "Đưa phiếu vào
   nhận xét QA" and the existing "Lưu đánh giá QA" button.
10. If follow-up is necessary, create a Vụ việc with owner and deadline.
    Finish at /analytics: count completed calls, pending QA, not
    unvalidated emotion accuracy.

## Read-only pre-demo check on FTISU

    cd ~/services/isemotalk
    git fetch origin
    git switch feat/remote-gpu-full-pipeline-20261123
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    nvidia-smi
    python3 scripts/audit_six_wavs.py --api http://127.0.0.1:3102

The audit prints actual call IDs, errors, ASR provenance, anonymous
speaker-turn count, confirmed SER status and XLM-R screening. It does
not delete or edit calls. If old files failed, use Retry on the
corresponding call. Successful files can be reanalyzed to a new
independent call by the "Chạy lại ASR + QA" button.

## A. Real anonymous speaker diarization: separate Pyannote venv

Official gated model:
https://huggingface.co/pyannote/speaker-diarization-community-1
Accept the model access terms on Hugging Face. Do not paste the HF
token into chat or commit it to GitHub. Only run on consented audio.

Do NOT install pyannote into the existing PhoWhisper/XLM-R venv.
The isolated Python worker avoids dependency conflicts and releases
memory when it exits.

    cd ~/services/isemotalk
    python3 -m venv ~/services/isemotalk-private/venvs/diar
    ~/services/isemotalk-private/venvs/diar/bin/python -m pip install -U pip
    ~/services/isemotalk-private/venvs/diar/bin/python -m pip install "pyannote.audio>=4,<5" numpy huggingface_hub

Find the exact consented uploaded WAV path on FTISU; filenames may
have changed during secure storage:

    find ~/services/isemotalk-speech-demo/uploads -maxdepth 1 -type f -name "*.wav"

Export HF_TOKEN privately in FTISU only. After verifying an approved
real audio path, stage and smoke-test the gated model:

    ~/services/isemotalk-private/venvs/diar/bin/python inference/scripts/stage_pyannote_community.py --smoke-audio /absolute/consented/recording.wav

The script checks at least 6 GiB free HF cache disk, pins an immutable
revision, runs a genuine CPU test, and writes only a private selection
manifest after success. Restart the ISEmoTalk backend via its regular
launcher. Default diarization uses the separate CPU worker; optional
CUDA requires controlled GPU memory and a manual environment setting.

Output Voice A/B is anonymous. It cannot prove A is Agent. ASR windows
can span two speakers and remain marked mixed. The user verifies roles
with original audio and the existing QA Save flow.

## B. Authentic F4 emotion model: no fake fallback

The paper F4 weights and exact serving factory are not in this public
repository. Never rename a generic SER model F4.

Find candidate files on FTISU without changing research data:

    cd ~/services/isemotalk
    inference/.venv/bin/python inference/scripts/inventory_private_f4.py

Recovery requires the original F4 weight files, audio preprocessing,
PhoBERT tokenizer, labels, factory code and labeled held-out audio
manifest. The existing CheckpointSer requires SHA256 for every
declared artifact and a successful four-class verification record.

Once REAL private paths and a compatible factory are established,
run from the inference directory (replace placeholders with audited
paths, do not run these as if they are real):

    cd ~/services/isemotalk/inference
    ISEMO_SER_FACTORY=your_package.factory:build ISEMO_SER_CONFIG=/absolute/private/ser/config.json .venv/bin/python -m app.verify --manifest /absolute/private/ser/eval.jsonl --min-macro-f1 0.60
    .venv/bin/python scripts/activate_verified_ser.py --factory your_package.factory:build --config /absolute/private/ser/config.json

The first gate is a held-out four-class sanity check and artifact
identity check. It is NOT proof of accuracy on real call-center speech.
Restart only the ISEmoTalk runtime. Reprocess audio to obtain actual
F4 predictions; old records remain unchanged. The emotion timeline
remains hidden unless genuine stage evidence says verified.

## C. Local LLM insight: no external API

If installing Ollama and the model is permitted by FTISU policies,
ensure available disk and check the official model license. Start
Ollama on loopback, preferably CPU to avoid exhausting the FTISU GPU.

In a separate terminal, if Ollama is installed:

    OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NUM_GPU=0 ollama serve

In another FTISU terminal:

    ollama pull qwen2.5:3b-instruct
    cd ~/services/isemotalk
    inference/.venv/bin/python inference/scripts/activate_local_llm.py --model qwen2.5:3b-instruct

Restart ISEmoTalk backend after activation; the API checks the actual
live local model inventory. The LLM is invoked on demand, not during
initial upload, and never sends transcript data to a cloud API.
JSON output is validated against source utterance evidence IDs. A
claim without a supporting ID must not be used as a QA conclusion.

## Human QA scoring and scientific value

The human proposal is 15/25/20/25/15 for understanding, correct
instructions, compliance, resolution and communication. Each verdict
needs actual audio segment evidence; policy and CRM scores need
external source notes. An unknown criterion does not mean FAIL or
zero. A /100 score is not shown unless every criterion is assessed.
The transcript-only synthetic XLM-R index is independent of this.

Scientific validation should compare text-only, verified audio SER
and their combined features at the same QA review budget, on labeled
real Vietnamese customer-service calls and speaker-disjoint splits.
Report WER/CER for ASR, DER for diarization, macro-F1/UAR for SER,
and Precision@K/Recall@K for QA priority. SER usefulness must be
empirically demonstrated; it is not established by a chart alone.

Before saying the full pipeline is deployed, verify six WAV outcomes,
real A/B anonymous diarization from staged Community-1, authentic F4
checkpoint identity plus real-audio smoke, working local Qwen evidence
JSON, and saved human QA record. CI passing proves code tests only.

Do not delete existing database, audio, model weights or unrelated
GPU training jobs. Do not expose credentials, OTP or customer PII.
