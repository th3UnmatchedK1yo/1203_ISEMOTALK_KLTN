# ISEmoTalk — QA cuộc gọi tiếng Việt có bằng chứng SER

ISEmoTalk là ứng dụng **xem xét sau cuộc gọi**: người làm QA nghe đúng đoạn ghi âm, đối chiếu transcript và dự đoán cảm xúc, lưu nhận xét, rồi ghi nhận kết quả xử lý hoặc việc cần gọi lại. SER giúp tìm bằng chứng để người dùng kiểm tra; quyết định nghiệp vụ vẫn do người phụ trách xác nhận.

## Phạm vi đang có

- Upload WAV/MP3/M4A; nhập transcript hoặc kết quả JSON/CSV đã có. Pipeline nền lưu tiến độ, lỗi, thời gian từng bước và nguồn kết quả.
- Audio/timeline đồng bộ với câu nói; đánh giá thủ công, sửa transcript/vai người nói, giữ đầu vào gốc và cảnh báo dự đoán dựa trên văn bản cũ.
- Bản nháp trong phiên trình duyệt; lưu có kiểm tra phiên bản để tránh ghi đè giữa các tab.
- Hồ sơ vụ việc: mã liên hệ/ticket, hàng đợi, lý do gọi, trạng thái, người phụ trách, hạn gọi lại, kết quả và lịch sử cập nhật độc lập với trạng thái QA.
- Xuất CSV phục vụ phân tích và JSON chứa bằng chứng, đánh giá, lịch sử nghiệp vụ. JSON này là snapshot kiểm toán, không phải bản sao lưu toàn bộ hệ thống.
- Màn hình **Nghiên cứu & phạm vi ứng dụng** giải thích mối liên hệ với F1/B2/F4 của paper.

**Trạng thái mô hình phải đọc theo từng thành phần.** ASR faster-whisper-small có thể chạy thật bằng cache trên máy; SER mặc định vẫn là mô phỏng. Chín checkpoint H5 lịch sử đã được xác minh trong archive, nhưng để phục vụ từ audio thô vẫn cần khôi phục đúng encoder, tokenizer, tiền xử lý và factory. Không có kết quả benchmark hoặc hiệu năng laptop mới được suy ra từ test phần mềm.

## Chạy web trên laptop, model trên server GPU nhóm (đường chính mới)

- **Server Linux:** Express + SQLite + recording + FastAPI + ASR/SER thật cùng một máy. Không chuyển đường dẫn audio Windows sang Python trên Linux.
- **Laptop:** chỉ chạy React/Vite, gọi backend qua SSH tunnel. Không lưu model, không train trên laptop.
- Nhánh triển khai: `feat/remote-gpu-full-pipeline-20261123`. Server cần package SER private có encoder, tokenizer, weights, manifest kiểm chứng trước khi chạy; các script từ chối mock/weights chưa sẵn sàng.
- Runbook: [REMOTE_GPU_DEPLOYMENT.md](docs/REMOTE_GPU_DEPLOYMENT.md).
- Lệnh chính: trên server `npm run remote:preflight` rồi `npm run remote:server`; trên laptop SSH port forward `13001 -> 3001`, rồi `npm run build` và `npm run remote:web`. Kiểm tra model/server bằng `npm run remote:check`, thực nghiệm tích hợp bằng `npm run remote:smoke -- /absolute/path/audio.wav`.
- **Không được nhầm:** CI/backend test chỉ kiểm tra code. Chưa có bằng chứng deployment SER thật trên GPU server cho tới khi chạy smoke và đánh giá corpus có nhãn.

## Chạy bản trình bày

Yêu cầu: Node 22, Python 3.11 hoặc 3.12, FFmpeg/FFprobe trên PATH. Giữ môi trường Python hiện có nếu đã dùng được ASR. Hướng dẫn đầy đủ và xử lý lỗi: [DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md).

```powershell
npm ci
npm run build
```

Mở PowerShell ở thư mục dự án và chạy một lệnh:

```powershell
npm run demo
```

Giữ terminal này mở trong lúc dùng web. Lệnh kiểm tra build/Python/cổng, rồi khởi động và theo dõi web, API, inference cùng nhau; một dịch vụ thoát sẽ dừng cả nhóm và ghi log. Không cần activate venv. Nếu đang gặp hiện tượng terminal trong VS Code tự quay về dấu nhắc, thử lệnh này trong Windows Terminal/PowerShell riêng để thu log rõ ràng.

Sau các thông báo startup, mở <http://127.0.0.1:5173>. Chạy kiểm tra từ terminal thứ hai:

```powershell
npm run demo:check -- --warmup-asr
```

Lệnh kiểm tra nội dung HTML/JavaScript khớp build, cấu hình API của bundle, proxy `/api`, API trực tiếp và inference; build thành công chưa đủ để kết luận web đang chạy. Lệnh này có thể báo mô phỏng một cách hợp lệ. Muốn kiểm tra điều kiện **SER thật đã kiểm chứng**, dùng thêm `--require-real-ser`; lệnh phải thất bại nếu SER vẫn mock. Warmup chỉ nạp ASR từ cache; cần chạy một file ngắn để đo bước suy luận.

## Phát triển và kiểm thử

```powershell
npm run dev
npm test
npm run typecheck:server
npm run build
# Cài dependencies test nhẹ trong venv trước, nếu chưa có
.\inference\.venv\Scripts\python.exe -m pip install --no-cache-dir -r inference/requirements-test.txt
npm run test:inference
```

Stack: React/Vite → Express/SQLite → FastAPI. Một worker pipeline trong bản local; API bind `127.0.0.1`. Đây chưa phải dịch vụ tổng đài nhiều người dùng. Bản dev có thể khởi tạo dữ liệu mô phỏng khi DB hoàn toàn trống; `ISEMO_AUTO_SEED=0` tắt việc đó. Không chạy seed/reset trên dữ liệu cần giữ.

## Tài liệu chính

- [Kiểm toán, mục tiêu đồ án và lộ trình](docs/THESIS_AUDIT_20261122.md).
- [Kịch bản chạy và báo cáo](docs/DEMO_RUNBOOK.md).
- [Nghiệp vụ, vị trí model, kiến trúc và lựa chọn triển khai](docs/BUSINESS_ARCHITECTURE.md).
- [Chẩn đoán web local và bằng chứng sửa ngày 23/11](docs/audits/startup-20261123.md).
- [Khôi phục và kiểm chứng package SER](docs/SER_PACKAGE_VERIFICATION.md).
- [ASR offline, môi trường và giới hạn tài nguyên](docs/OFFLINE_ASR_SETUP.md).
- [Backend](docs/audits/backend-20261122.md), [frontend](docs/audits/frontend-20261122.md), [inference/nghiên cứu](docs/audits/inference-research-20261122.md).
- [Thiết kế](docs/superpowers/specs/2026-11-22-thesis-demo-design.md), [kế hoạch](docs/superpowers/plans/2026-11-22-thesis-demo-hardening.md), [bằng chứng triển khai](docs/IMPLEMENTATION_LEDGER_20261122.md).

Audio, cơ sở dữ liệu người dùng, transcript riêng tư, model weights và bản backup nghiên cứu không thuộc public Git repository.
