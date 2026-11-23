# ISEmoTalk — Real QA MVP và kịch bản bảo vệ giữa kỳ (23/11/2026)

## Mục tiêu sử dụng đúng nghiệp vụ

Hệ thống hỗ trợ bộ phận QA kiểm tra **các cuộc gọi đã kết thúc**, lựa chọn cuộc gọi cần nghe lại và theo dõi việc xử lý, không tự động kết luận nhân viên sai, khách hàng hài lòng hay vụ việc đã giải quyết.

**Giới hạn dữ liệu:**
- OneVoice = **kịch bản hội thoại CSKH đọc bằng giọng TTS tổng hợp**, có transcript và nhãn nguồn `needs_attention`; dùng để thử phần mềm và QA text classifier, không phải audio khách hàng thật. Đây là dataset từng dùng để fine-tune XLM-R trên GPU.
- FOSD/FLEURS = bản ghi giọng người, có transcript, **không phải cuộc gọi CSKH**; chỉ nên dùng đánh giá ASR.
- DataHive = hội thoại điện thoại thật nhưng nói chuyện tự nhiên, không phải hỗ trợ khách hàng, không có transcript. Không sử dụng để trình bày đánh giá lỗi nhân viên hay đo nghiệp vụ.
- SER F4 từ paper = emotion2vec + PhoBERT + CrossAttentionFusion, 4 cảm xúc; **chưa được kết luận có thể chạy trên FTISU** cho đến khi private package/hash/heldout verification và real WAV smoke đạt. Không thay bằng mock để có màu đẹp.

## A. Chọn case thật theo nội dung dataset trước khi nói với thầy

FTISU (đọc SQLite, không chạy AI, không sửa DB):
```bash
cd ~/services/isemotalk
git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
source ~/.local/share/isemotalk-node-env.sh
npm run remote:choose-case
```

Lệnh liệt kê ID và đoạn đầu transcript OneVoice hiện có theo từ khóa `hoàn tiền`, `giao hàng`, `đổi trả`. Nghe chính audio của ID đó rồi mới quyết định chọn kịch bản. **Không nói khách phàn nàn trễ giao hàng nếu file WAV không có câu đó.** `nhãn nguồn synthetic` không phải model prediction.

## B. QA model thật, không cần đợi F4

Máy FTISU đã có QA model train xong 3 seed; seed 2026 thường ở:
`~/services/isemotalk-private/models/qa-xlm-r-seed2026-v1`.

Trong terminal FTISU, kiểm tra (read-only):
```bash
cd ~/services/isemotalk
test -x inference/.venv/bin/python && echo PYTHON_OK
test -s ~/services/isemotalk-private/models/qa-xlm-r-seed2026-v1/model.safetensors && echo QA_WEIGHTS_OK
test -s ~/services/isemotalk-speech-demo/isemotalk.db && echo SPEECH_DB_OK
```

Dừng **chỉ terminal** đang chạy `npm run remote:speech-demo` bằng Ctrl+C. Đừng dừng SSH tunnel hay sửa model checkpoint. Chạy:
```bash
source ~/.local/share/isemotalk-node-env.sh
npm run remote:qa-runtime
```

Lệnh này giữ dataset và SQLite riêng ở `~/services/isemotalk-speech-demo`, mở FastAPI `127.0.0.1:8001` và Express `127.0.0.1:3101`. Các điều kiện bị thiếu được báo rõ trước khi chạy; nếu chưa có Python CUDA serving venv thì chuẩn bị bằng `bash scripts/bootstrap-gpu-host.sh --with-ml` sau khi kiểm tra đĩa. Lệnh `remote:qa-runtime` **không train lại model, không xóa dữ liệu, không gán nhãn giả**.

Trong một FTISU terminal khác:
```bash
cd ~/services/isemotalk
npm run remote:qa-smoke
```

Phải được `PASS genuine CUDA-trained QA checkpoint inference` với `modelSha256`. Lệnh smoke này không ghi SQLite, không xác nhận SER hay hiệu quả trên khách hàng thật.

Windows: giữ SSH `13001 -> 3101`, dừng **chỉ terminal frontend 5173** cũ, rồi:
```powershell
cd C:\Users\Legion\Documents\1203_KLTN
git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
npm run build
npm run remote:qa-check
npm run remote:web:qa
```

Mở `http://127.0.0.1:5173`; trong trang **Cuộc gọi**, bấm **`Chấm QA OneVoice trang này`** để xử lý lần lượt các cuộc gọi nguồn đang hiển thị bằng checkpoint XLM-R thật (không chạy trên DataHive/FOSD/FLEURS). Sau đó chọn một **OneVoice** có transcript để xem kết quả và có thể bấm `Phân tích bằng model QA` nếu muốn chạy lại một cuộc. Đó là lần suy luận XLM-R thật từ model đã train, không phải label của dataset. Trang Calls có cột **AI QA** riêng với `P(cần xem)`; cột SER không hiện cảm xúc khi chưa chạy F4. Thay đổi transcript làm kết quả QA cũ **hết hiệu lực**, cần chạy lại. Lưu review/case/task vẫn làm như cũ.

LƯU Ý: QA có 3 seeds hoàn tất; default runtime sử dụng **seed 2026** để chạy demo nhất quán, không tự chọn seed 2027 chỉ vì điểm test cao nhất. Chênh lệch Precision@25 các seed cần thảo luận trong báo cáo.

## C. Bật ASR thật từ bản ghi âm (bổ sung cho QA, SER chưa chạy)

Sau khi QA-only đã chạy, để phục vụ ASR thật, khi **không có job GPU khác đang chạy**, trong FTISU terminal khác:
```bash
cd ~/services/isemotalk
npm run remote:stage-asr
```

Lệnh tải/reuse **duy nhất** pinned `vinai/PhoWhisper-base`, không train; cần đủ dung lượng và nguồn Hugging Face. Sau đó dừng **chỉ terminal `remote:qa-runtime`**, chạy:
```bash
npm run remote:qa-asr
```

Windows frontend `remote:web:qa` đã mở không cần đổi tunnel. Refresh web; vào một hồ sơ nguồn OneVoice, bấm `Phân tích WAV bằng ASR thật`. Backend tạo hồ sơ **mới** với cùng bytes WAV/SHA256, bảo toàn hồ sơ transcript nguồn. Trong hồ sơ mới, `validate → transcribe(PhoWhisper) → diarize(none/unknown nếu không tách được vai trò) → emotion(skipped) → finalize`. Sau `ready`, mới bấm `Phân tích bằng model QA` để chạy XLM-R trên **ASR transcript**. So sánh với transcript nguồn để mô tả lỗi nhận dạng giọng nói và tác động đối với QA.

**Chưa có timestamp speaker/utterance hoàn chỉnh từ transcript nguồn OneVoice**: bản import chỉ 1 utterance/clip. Với audio mono, không tự nhận ai là agent/customer. Người QA cần nghe và xác minh; không dùng unknown-speaker để suy cảm xúc riêng khách hàng.

Nếu `remote:qa-asr` lỗi vì thiếu pretrained asset/dependency/CUDA, quay về `remote:qa-runtime`, demo **QA thật từ transcript nguồn**. Đừng bật mock hay `ISEMO_ALLOW_UNVERIFIED=1` để chạy cho bằng được.

## D. Script nói với thầy — dựng quanh một ca thực tế có trong audio

Ví dụ **case giả định** để giải thích đường nghiệp vụ: sau khi mua hàng online, khách gọi phản ánh đơn chưa giao, có hẹn giao nhưng vẫn không nhận được hàng, yêu cầu nhân viên cập nhật và gọi lại. **Trước khi trình chiếu, thay nội dung ví dụ bằng đúng OneVoice audio/transcript mà `remote:choose-case` tìm được.** Không coi ví dụ tự viết là sự kiện ghi âm đã được xác nhận.

1. **Nguồn thông tin/đầu vào.** Sau cuộc gọi, có file ghi âm và thông tin mã cuộc gọi, thời gian, người phụ trách. Dùng bản ghi OneVoice mô phỏng nghiệp vụ và nói rõ đó là TTS. Web tải hồ sơ vào queue chứ không tự gọi điện hay truy cập tổng đài.
2. **Sàng lọc.** Bộ phận QA không thể nghe thủ công mọi cuộc gọi. Mô hình XLM-R đọc transcript và đưa ra **gợi ý mức cần kiểm tra**, không phải phán quyết đúng/sai. Chạy nút trên web để có score/model SHA. Dữ liệu OneVoice synthetic chưa chứng minh độ chính xác trên tổng đài người thật.
3. **Đối chiếu nội dung và âm thanh.** QA mở hồ sơ có điểm chú ý, nghe câu phản ánh và câu nhân viên cam kết xử lý. Nếu ASR đã bật, transcript được tạo mới bằng PhoWhisper và có thể đối chiếu transcript nguồn; nếu chưa, dùng transcript gốc của dataset và nói rõ nguồn. F4 nếu có đầu ra được xác minh mới hiển thị nhãn cảm xúc từng đoạn; hiện chưa có, nên **không có màu giả**.
4. **Quyết định người thật.** AI có thể gợi ý cần xem, nhưng QA phải kiểm tra việc khách đã được hỗ trợ hay còn vấn đề chưa giải quyết. Nếu yêu cầu còn mở, QA ghi nguyên nhân và liên kết **case**, giao task gọi lại với deadline, người chịu trách nhiệm. Nếu đã xử lý ổn, QA có thể ghi nhận không tạo case.
5. **Theo dõi và đóng vòng.** Sau khi nhân viên gọi lại/cung cấp cập nhật, QA nhập kết quả và hoàn tất nhiệm vụ, đóng vụ việc theo điều kiện. Analytics đọc trạng thái từ SQLite, không tự suy tỷ lệ hài lòng từ cảm xúc.
6. **Phản ví dụ.** Một khách có giọng bực bội vì giao trễ, nhưng nhân viên đã giải quyết và khách xác nhận đồng ý. Nhãn `needs_attention` chỉ giúp QA đến đúng nơi cần nghe; nếu QA không tìm thấy vấn đề mở thì không tự động coi đó là lỗi nhân viên.

## E. Điều đã có / còn thiếu phải nói thẳng

| Tầng | Có code + cách thử | Chưa được chứng minh trên FTISU |
|---|---|---|
| React Calls/Review/Cases/Analytics, Express/SQLite/tunnel | Browser + `remote:mvp-check` đã từng PASS | Nghiệm thu end-to-end sau bật real runtime |
| XLM-R synthetic OneVoice QA | 3 seed train; `remote:qa-runtime`, `remote:qa-smoke` | Kết quả live smoke/model SHA theo file trên máy, hiệu quả thực tế |
| PhoWhisper | Phần mềm adapter, có lệnh tải pinned weights, `remote:qa-asr` | WER/CER và latency thực tế trên OneVoice/FLEURS |
| F4 acoustic-lexical fusion | Private factory/source và kiểm định hash/eval path | Load verified F4, đối chiếu reference, Macro-F1/UAR ngoại corpus, end-to-end WAV |
| Speaker diarization | Stereo channel mapping khi hai kênh thực sự tách; mono giữ unknown | Không có reliable manual-independent agent/customer diarization trên mono |
| Business KPI | QA-reviewed/case/task/export | Chưa có ROI, CSAT, năng suất tổng đài ngoài đời |

Chỉ ghi báo cáo giữa kỳ những hạng mục đã trực tiếp nghiệm thu. Không công bố một tỷ lệ tổng hợp “độ chính xác web” lấy từ macro-F1 của XLM-R.

## F. Hướng F4 full fusion sau MVP

Khi đã có artifact gốc từ private `SER_VI_TRANSFER`, dùng `stage-gpu-models.sh` trên FTISU với 9 historical F4 heads có provenance, chọn một condition/seed đúng metadata, stage emotion2vec+PhoBERT/PhoWhisper pinned, held-out VNEMOS sanity, kiểm tra SHA và chạy `remote:smoke`. Chỉ lúc `SER verified=true` và inference thật từ WAV thành công mới dùng `remote:server`/ `remote:web`. F4 chỉ tạo `fused` head; `acoustic`/`lexical` riêng chỉ hiện nếu có model riêng thật, tuyệt đối không suy từ fused output.
