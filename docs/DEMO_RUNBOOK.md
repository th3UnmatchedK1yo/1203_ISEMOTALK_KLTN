# ISEmoTalk — chạy, kiểm tra và báo cáo đồ án

Áp dụng cho `feat/thesis-demo-hardening-20261122`, cập nhật ngày 23/11/2026. Mục tiêu là một buổi trình bày có thể giải thích từng bước, giữ được thao tác QA khi gặp lỗi và công bố đúng model nào đang chạy. Xem [nghiệp vụ và kiến trúc](BUSINESS_ARCHITECTURE.md) để biết model nằm ở đâu, từng phần làm gì và điều kiện chuyển lên server.

## 1. Cập nhật an toàn trên Windows

Dừng các terminal web/API/inference bằng Ctrl+C. Chạy ở `C:\Users\Legion\Documents\1203_KLTN`:

```powershell
git status
git fetch origin
git switch feat/thesis-demo-hardening-20261122
git pull --ff-only origin feat/thesis-demo-hardening-20261122
npm ci
npm run build
```

Nếu `git status` có thay đổi của bạn, giữ lại trước khi chuyển nhánh; không dùng `reset --hard`, `clean`, hoặc script seed/reset để giải quyết. Nhánh này kế thừa PR #5; không cần lần lượt switch các nhánh cũ. `npm ci` cài lại dependency Node từ lockfile, không xóa `server/data` hay model cache.

Nếu đang có hồ sơ quan trọng, sao lưu **cả thư mục `server/data`** khi API đã dừng; đặt bản sao ở nơi còn đủ dung lượng ngoài thư mục dự án. JSON/CSV export hữu ích để đọc bằng chứng nhưng không chứa recording và không phải bản backup có thể phục hồi toàn bộ.

### Nếu ASR hiện tại đã chạy được

Giữ `inference/.venv`, `inference/.env` và cache model hiện có. Không tạo lại venv, tải Torch hay đổi sang model lớn chỉ để cập nhật giao diện.

`npm run dev:inference` nay chọn đúng `inference/.venv/Scripts/python.exe` trên Windows; nó không âm thầm dùng Python global. Nếu cần một môi trường đã chuẩn bị ở chỗ khác, `ISEMO_PYTHON` phải là đường dẫn đầy đủ tới executable đó.

### Chỉ khi chưa có môi trường Python

```powershell
py -3.11 -m venv inference\.venv
.\inference\.venv\Scripts\python.exe -m pip install --no-cache-dir -r inference/requirements-core.txt
```

Bản nhẹ này chạy API/mock và kiểm tra audio; nó không cung cấp model thật. Chỉ để dùng **cache small đã có**, xem [OFFLINE_ASR_SETUP.md](OFFLINE_ASR_SETUP.md). Không chạy lại script cấu hình ASR nếu môi trường hiện tại đang đúng; script đó chủ động đặt SER về mock.

## 2. Venv và model cache nằm ở đâu?

| Thành phần | Vai trò | Vị trí thường dùng |
|---|---|---|
| Python venv | Các package FastAPI, CTranslate2, faster-whisper… | `inference/.venv` |
| Hugging Face Hub cache | Weights/tokenizer/snapshot model | Mặc định `%USERPROFILE%\.cache\huggingface\hub`, có thể đổi bởi `HF_HOME`/`HF_HUB_CACHE` |
| Config runtime | Chọn adapter, model, device, budget | `inference/.env` |
| Dữ liệu ứng dụng | DB và recording đã upload | `server/data` |

Tách cache và venv giúp nhiều môi trường dùng chung weights, không nhân đôi model mỗi lần tạo venv. Xóa venv không xóa weights trong cache. Nếu muốn chuyển cache sang ổ khác, thực hiện thành một thay đổi riêng: kiểm kê/copy đúng snapshot, trỏ cấu hình đúng và kiểm tra offline trước khi xóa chỗ cũ. Không cần làm việc này ngay trước báo cáo. [Hugging Face: biến môi trường](https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables), [cache](https://huggingface.co/docs/huggingface_hub/guides/manage-cache).

## 3. Khởi động bản trình bày

**Terminal 1 — giữ cả ba dịch vụ chạy cùng nhau:**

Nếu đang chẩn đoán lỗi terminal VS Code quay về dấu nhắc, mở **Windows Terminal hoặc PowerShell riêng** từ Start. Việc này giúp tách hành vi tích hợp của editor; chưa có bằng chứng editor là nguyên nhân làm tiến trình dừng.

```powershell
Set-Location C:\Users\Legion\Documents\1203_KLTN
npm run demo
```

Không cần chạy `Activate.ps1`: launcher gọi trực tiếp Python trong `inference/.venv` hoặc `ISEMO_PYTHON` tuyệt đối đã cấu hình. Giữ cửa sổ này mở. Khi đang phục vụ, lệnh tiếp tục chạy và không trả lại dấu nhắc `PS ...>`; Ctrl+C dừng nhóm dịch vụ.

Launcher thực hiện các việc sau:

- Kiểm tra Node 22+, build `dist/index.html` và `dist/demo-build.json`, Python và các cổng 5173/3001/8001 trước khi khởi động. Bản build phải dùng API cùng origin; nếu đã build với `VITE_API_BASE_URL` khác, cần bỏ override trong môi trường build rồi build lại. Cổng bị chiếm sẽ báo lỗi, không tự giết tiến trình khác hoặc chuyển sang cổng khác.
- Chạy `dev:inference`, `start:api` và `preview`, có nhãn log/PID. Một dịch vụ thoát, kể cả code 0 ngoài thao tác dừng chủ động, làm cả nhóm dừng và launcher báo lỗi.
- Dùng một thư mục audio chung cho API/Python. `ISEMO_DATA_DIR` có thể đổi nơi lưu; `ISEMO_UPLOADS_DIR` xuất trong terminal phải khớp. Giá trị này được truyền vào tiến trình con, không sửa file `.env`.
- Mặc định `ISEMO_AUTO_SEED=0` khi biến này chưa được đặt. Dữ liệu đã có được giữ; lựa chọn ASR/SER, cache và venv hiện có được giữ. Bước kiểm tra khởi động không tải model. API có thể tiếp tục job đang chờ theo adapter đã cấu hình: faster-whisper dùng cache cục bộ, còn adapter PhoWhisper/pyannote tùy chọn có thể cần mạng để nạp tài sản chưa có.
- Trên POSIX, đặt fallback 15 giây trước khi buộc dừng tiến trình còn treo. Backend quản lý cây tiến trình của `concurrently` trên Windows dùng `taskkill /T /F`, nên không bảo đảm API có đủ thời gian drain trên Windows. Hoàn tất/lưu thao tác đang làm trước khi chủ động dừng nhóm.

Sau các thông báo startup, mở <http://127.0.0.1:5173>. Vite preview proxy `/api` sang port 3001; API dùng inference port 8001. Đây là bản phục vụ local cho báo cáo. Cần build lại sau mỗi lần sửa frontend. `npm run build` chỉ tạo file; nó không khởi động web.

**Terminal 2 — kiểm tra trước buổi demo:**

```powershell
npm run demo:check -- --warmup-asr
```

Kết quả cần đọc theo từng component:

- Build và frontend tại 5173; HTML và JavaScript trùng bytes với build cục bộ; API đi qua proxy web và API trực tiếp đều kết nối được inference. Một dịch vụ hỏng không che kết quả chẩn đoán các dịch vụ khác. Kiểm tra bytes không thay bước thử thao tác trên trình duyệt.
- `ASR: thành phần thật · faster_whisper`, `ready=true`, sau warmup có `loaded=true` nếu cache/package hợp lệ.
- `SER: MOCK / mô phỏng` nếu chưa khôi phục full pipeline. Đây là trạng thái chưa hoàn thành model, không phải lỗi giao diện.
- `diarization: none` nghĩa không có model gán vai agent/customer. Với mono phải gán thủ công hoặc cung cấp transcript có role. Không tự suy người nói đầu là agent.
- `FFmpeg: sẵn sàng`. Đọc danh sách phải thành công.

`ready` chỉ nói điều kiện component; `loaded` nói model đã ở trong tiến trình; `verified` nói package đã qua cơ chế kiểm chứng, không phải accuracy trên call center. Một check toàn hệ thống có thể exit 0 khi các component mock hoạt động đúng. Muốn buộc điều kiện SER thật:

```powershell
npm run demo:check -- --require-real-ser
```

Lệnh phải exit 2 nếu SER mock/unready/unverified. Không tắt điều kiện kiểm chứng để có nhãn “real”.

### Nếu vẫn thấy `ERR_CONNECTION_REFUSED`

Thông báo này xảy ra trước khi React hay model xử lý yêu cầu. Ảnh ngày 22/11 cho thấy cả ba lệnh đã quay lại dấu nhắc PowerShell; chưa đủ dữ liệu xác định vì sao chúng kết thúc. Build thành công, dòng “running” cũ hoặc activate venv không chứng minh listener còn sống.

Nếu `npm run demo` tự kết thúc, chụp log có tên dịch vụ/exit code ở cuối và chạy ngay:

```powershell
Write-Host "Demo exit code: $LASTEXITCODE"
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 5173, 3001, 8001 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
npm run demo:check
```

Gửi log này để phân biệt lỗi khởi động Python/API/web với tác động của terminal. Không dùng `npm audit fix --force`, tạo lại venv hoặc tải model lớn để sửa lỗi không có listener. Nếu có listener lạ, xác định đúng tiến trình/terminal trước khi tự dừng nó.

Khi cần chẩn đoán từng dịch vụ, vẫn có thể dùng ba terminal riêng với `npm run dev:inference`, `npm run start:api`, `npm run preview`. Phải giữ cả ba tiến trình chạy; `npm run demo` là đường mặc định cho buổi trình bày.

## 4. Bộ mẫu trình bày

Chuẩn bị trước buổi báo cáo, không phụ thuộc tải dữ liệu trên mạng trong lúc trình bày:

1. Một ghi âm tiếng Việt rõ lời 15–30 giây, có quyền sử dụng, để chứng minh đường upload và ASR thực tế. Nội dung đủ dài để kiểm tra text; tên file chứa `sad` không phải ground truth.
2. Một hồ sơ audio + transcript/role đã kiểm tra, để người xem tập trung vào tìm bằng chứng và review.
3. Khi có model thật: một bộ kết quả genuine đã tính trước, kèm model/package identity và audio. Import route phải giữ nhãn `imported`. Nếu chưa có, dùng mock được ghi rõ để minh họa riêng quy trình; không gọi nó là kết quả nghiên cứu.

Không tạo cảm xúc giả bằng cách đổi nhãn provenance. Không chọn duy nhất một ví dụ “đẹp” rồi suy ra độ chính xác. Chuẩn bị ít nhất một ví dụ model/ASR sai và chỉ ra cách QA phát hiện, sửa và lưu giới hạn.

## 5. Kịch bản báo cáo 5–7 phút

| Thời gian gợi ý | Thao tác | Ý cần giải thích |
|---|---|---|
| 0:00–0:45 | Mở Nghiên cứu & phạm vi | Bài toán QA sau cuộc gọi; mục tiêu là tìm/kiểm tra bằng chứng và hoàn tất hồ sơ |
| 0:45–1:30 | Mở hàng đợi, chỉ ID/nguồn/trạng thái | Call ID nội bộ khác mã tổng đài/ticket; processing, QA và resolution là ba tiến trình khác nhau |
| 1:30–2:15 | Upload clip ngắn hoặc mở job đã xong | ASR chuyển lời nói thành text; role có căn cứ; SER dự đoán từng đoạn; stage evidence cho biết thành phần thật/mock |
| 2:15–3:30 | Chọn moment/câu, nghe lại timestamp, đọc text | Quy tắc chỉ gợi ý đoạn để xem; câu đang phát phải đúng câu đang đánh giá; F4 không có hai đầu unimodal giả |
| 3:30–4:30 | Sửa transcript hoặc nhãn, lưu và reload | Gốc vẫn được giữ, prediction cũ bị đánh dấu; nhãn QA tách khỏi model; chưa tuyên bố đã rerun model |
| 4:30–5:30 | Nhập ticket, follow-up, owner, deadline; ghi kết quả | SER hỗ trợ phát hiện đoạn đáng chú ý; người phụ trách xác nhận hành động/đóng vụ việc |
| 5:30–6:30 | Export JSON/CSV và xem lịch sử | Hồ sơ kiểm tra lại được; thiếu model/dữ liệu phải trình bày rõ; nêu gate đánh giá tiếp theo |

Nếu job vẫn đang chạy, chuyển sang hồ sơ đã xử lý để trình bày QA rồi quay lại. Đây là giới thiệu đúng hai giai đoạn bất đồng bộ của sản phẩm; không che việc inference chưa xong.

## 6. Checklist trên chính laptop

Những dòng này là **kiểm tra còn phải làm trên máy trình bày**, không được tự đánh dấu từ build/test trong container.

- [ ] Chạy warmup, sau đó chạy clip ngắn lần đầu và lần hai; ghi cold/warm, duration, CPU/RAM/VRAM nếu có. Warmup không đo toàn suy luận.
- [ ] ASR từ audio khớp tương đối với lời nói; ghi lại lỗi cụ thể và model đang dùng.
- [ ] Chọn escalation/recovery: đoạn audio, câu được chọn và editor là cùng anchor cần review.
- [ ] Phát audio, pause, seek, đổi câu; không mất vị trí khi chỉ lưu note.
- [ ] Chuyển sang cuộc gọi khác khi request đang chậm; không hiện kết quả cũ.
- [ ] Sửa nhưng chưa lưu, chuyển trang rồi quay lại/refresh trong cùng phiên; draft phục hồi đúng call/version.
- [ ] Mở hai tab, tab B lưu trước; tab A không ghi đè; draft cũ tải về được, chỉ bỏ khi chủ động xác nhận.
- [ ] Chuyển chế độ upload không mang file ẩn từ tab trước.
- [ ] Lưu review, follow-up, reload, export, dừng và bật lại API: dữ liệu vẫn còn.
- [ ] Xem 1366×768, zoom 100%/125%, màn hình hẹp; không tràn ngang toàn trang, nút lưu rõ và nhãn cảm xúc đọc được trên máy chiếu.
- [ ] Tab qua các input/nút và thấy focus; lỗi có text; màu không là tín hiệu duy nhất.
- [ ] Kiểm tra SER thật riêng khi full package sẵn sàng; không biến mock acceptance thành ML acceptance.

Session draft không phải bản backup vĩnh viễn: đóng phiên trình duyệt hoặc dọn dữ liệu trình duyệt có thể mất nó. Nếu trình duyệt từ chối lưu draft, UI phải báo và cho tải bản nháp; lưu server trước khi dùng Back hoặc đóng trang.

### Phiếu đo đề nghị

Ghi: commit web; Python/package versions; CPU/GPU/RAM; adapter/model/revision; transcript source; file duration/channels/sample rate; số câu; cold/warm elapsed; stage times; RAM/VRAM peak; số lần thử; lỗi. `RTF = inference_seconds / audio_seconds`. Mỗi tốc độ phải kèm điều kiện, không áp số đo loopback/mock vào laptop.

Mục tiêu nghiệm thu giao diện đề xuất: thao tác mở/seek/lưu không bị chặn bởi inference, không mất draft, job lỗi có hướng xử lý và demo chạy liên tục hai lượt. Chỉ đặt ngưỡng thời gian sau khi đã có baseline trên máy này.

## 7. Xử lý sự cố trong buổi demo

| Triệu chứng | Kiểm tra/khôi phục |
|---|---|
| Web lỗi kết nối API | Terminal API có đang chạy không; port 3001; chạy `npm run demo:check`. Không đổi branch hoặc cài package ngẫu nhiên |
| API có, inference không reachable | Terminal inference, Python executable/venv và port 8001 |
| ASR ready nhưng chưa loaded | Chạy warmup; nếu fail đọc detail/log thật. Không tải weights trong buổi báo cáo |
| Job failed | Đọc stage/error, sửa căn nguyên rồi bấm thử lại. Đã có stage checkpoint; không cần xóa cuộc gọi |
| File dài bị từ chối | Kiểm tra duration/PCM budget; dùng đoạn ngắn phù hợp, không nâng giới hạn RAM thiếu căn cứ |
| Call không có khách hàng | Xác nhận/gán role trước khi diễn giải thống kê khách; không tự coi unknown là customer |
| Conflict khi lưu | Tải draft, đọc version mới, chủ động đối chiếu; không dùng force overwrite |
| Trình duyệt không giữ draft | Lưu lên server hoặc tải bản nháp trước khi rời trang |
| UI khác code vừa cập nhật | Build lại, khởi động preview; giữ dữ liệu/venv |
| SER vẫn mock | Trình bày đúng phạm vi hiện tại và gate khôi phục; không đổi allow_unverified để vượt kiểm chứng |

## 8. Các câu hỏi bảo vệ và câu trả lời có căn cứ

**Vì sao làm web này nếu đã có paper?** Paper trả lời câu hỏi về hành vi model dưới các điều kiện kiểm soát. Web thể hiện cách dùng đầu ra có nguồn gốc trong một quy trình QA: truy xuất bằng chứng, kiểm tra, sửa và ghi hành động. Giá trị ứng dụng phải được đánh giá riêng.

**Tại sao dùng small?** Đây là model ASR đã cache trên máy và chạy được bằng CPU INT8; chọn để giảm phụ thuộc tải/cài và giữ buổi demo có thể lặp lại. Nó không phải model SER và không thay thế text axis đã đóng băng trong paper. Chưa kết luận small tối ưu nếu chưa đo các lựa chọn.

**Một lần upload ra nhãn angry chứng minh gì?** Chứng minh đường phục vụ trả được một dự đoán trong cấu hình đó. Accuracy cần tập held-out có nhãn và support từng lớp; trong mock mode nó chỉ kiểm tra luồng phần mềm.

**Vì sao không chấm điểm nhân viên từ cảm xúc?** Cảm xúc chịu ảnh hưởng vấn đề khách gặp, ngôn ngữ, audio, người nói và lỗi model; một nhãn không đủ xác định chất lượng xử lý hoặc quan hệ nhân quả. QA cần nghe nội dung và theo rubric.

**Vì sao không realtime ngay?** Phạm vi đã chọn là QA sau cuộc gọi trên một laptop. Live telephony cần các điều kiện media streaming, concurrency và độ trễ riêng; bổ sung nó trước khi khôi phục model làm tăng rủi ro mà chưa củng cố đóng góp nghiên cứu.

**Đã có weights thì còn thiếu gì?** Head fusion H5 không bao gồm pretrained backbones. Cần encoder/tokenizer, tiền xử lý đúng, lineage và numerical parity; đã hash head không đồng nghĩa đã reproduce paper.

**Vì sao lưu cả text gốc và text sửa?** Transcript là đầu vào của mô hình đa phương thức. Giữ hai bản cho biết dự đoán được tính từ dữ liệu nào; rerun trong tương lai cần tạo inference run mới, không ghi đè lịch sử.

**CSAT/FCR lấy từ đâu?** CSAT cần phản hồi khảo sát; FCR cần xác định cùng vấn đề và các lần liên hệ trong cửa sổ theo quy định nghiệp vụ. DB hiện tại chưa đủ để tự tạo hai KPI đó từ emotion.

## 9. Kiểm thử kỹ thuật

```powershell
npm test
npm run typecheck:server
npm run build
.\inference\.venv\Scripts\python.exe -m pip install --no-cache-dir -r inference/requirements-test.txt
npm run test:inference
```

Bộ Python nhẹ không tải model/Torch; có kiểm tra FFmpeg thật trên WAV tổng hợp và fixture model giả được ghi rõ. `npm test` kiểm tra SQLite thật cùng các test API/helper. Chưa cấu hình một ESLint gate đầy đủ; không lấy script `lint` hiện tại làm bằng chứng code đã qua lint.

Bằng chứng tích hợp và giới hạn ở [ledger](IMPLEMENTATION_LEDGER_20261122.md); kế hoạch SER thật ở [kiểm toán đồ án](THESIS_AUDIT_20261122.md) và [package verification](SER_PACKAGE_VERIFICATION.md).
