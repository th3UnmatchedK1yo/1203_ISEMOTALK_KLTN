# ISEmoTalk — tiến độ thực tế và phần việc còn lại

Ngày 23/11/2026. Nhánh làm việc: `feat/thesis-demo-hardening-20261122`; thay đổi được tập hợp trong draft PR #6. Không gán phần trăm hoàn thành chung: phần mềm, model, nghiên cứu và nghiệm thu trên laptop có tiêu chí khác nhau.

## 1. Đã triển khai đến đâu?

| Phần | Code hiện có | Điều chưa được suy ra từ việc có code |
|---|---|---|
| Nghiệp vụ post-call QA | Upload/import → job/stage → transcript/prediction → tìm bằng chứng → QA → follow-up/kết quả → export | Chưa tích hợp webhook tổng đài/CRM hoặc cuộc gọi live |
| Frontend | React/TypeScript, queue/detail/player/review/workflow, trạng thái lỗi, draft/conflict, theme/readability đã chỉnh | Cần kiểm tra trực tiếp trên laptop/máy chiếu 100%/125%; không tự coi test logic là nghiệm thu hình ảnh |
| Backend | Node/Express/TypeScript; giới hạn input, queue tuần tự, stage transaction, retry, provenance | Chưa có phân quyền user, nhiều worker/tenant hoặc public deployment |
| Khởi động local | `npm run demo` kiểm tra điều kiện và giữ 3 dịch vụ; `demo:check` kiểm tra frontend/API/Python | Chưa xác định chính xác nguyên nhân terminal Windows cũ thoát; cần log nếu tái diễn |
| ASR | Đường faster-whisper chạy offline từ cache, warmup, health và giới hạn audio | Người dùng đã quan sát small ra text thật; cloud tests không đo accuracy hoặc latency trên laptop |
| SER | Adapter có contract/hashing/verification, nullable unimodal outputs và cảnh báo mock | **Chưa có gói raw-audio F4 hoàn chỉnh được xác minh chạy thật trong web** |
| CSDL | SQLite quan hệ, version, transaction; đợt này thêm migration/domain checks, full workflow snapshots, cleanup outbox và read-only checker | Chưa chạy checker trên file DB hiện tại của laptop; chưa có annotation history đầy đủ/model run registry |
| Tài liệu | Nghiệp vụ, kiến trúc, model locations, demo runbook, ERD/data dictionary, audit và plan | Cần đối chiếu bản luận văn/paper cuối cùng, chốt thí nghiệm và tập kết quả có đúng provenance |

Các file trọng tâm: [BUSINESS_ARCHITECTURE.md](BUSINESS_ARCHITECTURE.md), [DATABASE_DESIGN.md](DATABASE_DESIGN.md), [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md), [SER_PACKAGE_VERIFICATION.md](SER_PACKAGE_VERIFICATION.md).

## 2. Model: có gì rồi, còn thiếu gì?

Đã kiểm kê lại:

- 9 historical H5 F4 heads M0/C0/M1 × seeds 13/42/2026 đã có trong phần phục hồi từ archive; hash khớp inventory, tổng 52,169,679 bytes. Đây là head, không phải toàn bộ encoder/tokenizer hoặc 9 dịch vụ cần chạy đồng thời.
- Source authentic `CrossAttentionFusion` và feature extraction truy cập được ở private repository [SER_VI_TRANSFER, historical commit 7c43afd0](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/tree/7c43afd0abcfe11bc7f30d93e60a33a3a281c466). [H5 loader ở e89f1542](https://github.com/th3UnmatchedK1yo/SER_VI_TRANSFER/blob/e89f15425747285fdadc1b016562826632e44b0d/src/serq1/h5_prediction.py) nhận feature cache; chưa phải một serving factory từ waveform.
- [Drive backup SER_BACKUP_20260928](https://drive.google.com/drive/folders/1zUiNQa_GsfUwPF7_K8pdP2uarV41VQei) và bốn thư mục IEMOCAP, VISEC, VNEMOS, VI_FINAL_TRAINING_20260913_144031 có quyền đọc/tải qua kết nối hiện có. Đây là kiểm tra metadata/quyền truy cập, chưa hash lại toàn bộ dataset.
- Archive có 92 WAV nhỏ; manifest liên quan có 90 example từ một speaker `spk04`, split `unassigned`. Có thể dùng kiểm tra đường đọc input; không tự gọi đây là test set độc lập với training.

Không cần người dùng upload lại cùng archive, kết nối Drive lại, viết `build_model` thay người triển khai, hoặc giải nén toàn bộ dataset. Chưa xác nhận bytes/revision đầy đủ của emotion2vec/PhoBERT/tokenizer trên laptop. Các feature manifest lịch sử còn cần truy vết theo hash gốc; không dùng kết quả lineage tháng 11 để giả nhận đã tái lập model tháng 10.

## 3. Việc triển khai có thể tự làm tiếp

| Thứ tự | Công việc | Điều kiện để gọi là xong |
|---|---|---|
| 1 | Phục hồi dependency source authentic, đối chiếu paper/condition/seed và metadata; chọn một gói triển khai | Có bảng lineage rõ, đúng labels/config và hash; không lựa chọn checkpoint chỉ vì tên có vẻ mới |
| 2 | Viết raw-waveform factory và package manifest | Extractor đúng quy ước, nạp head strict, khai báo toàn bộ encoder/tokenizer/source; fused-only được phản ánh đúng |
| 3 | Khôi phục reference samples/features có chọn lọc, kiểm tra tương đương | Đối chiếu preprocessing/feature/prediction; ghi sai khác và giới hạn do thiếu reference, không tự suy reproduction |
| 4 | Gắn inference run identity/input version vào kết quả trước khi mở rộng công bố model | Một kết quả truy ngược được model package, đầu vào, text version và thời điểm; hiện stage evidence mới chỉ bao phủ một phần |
| 5 | Hoàn thiện bộ chứng cứ nghiên cứu và demo | Confusion matrix, macro-F1/UAR/recall từng lớp trên split hợp lệ; đo thời gian cold/warm trên máy thật; kịch bản QA có cả dự đoán sai |

Đây là công việc còn lại có kế hoạch, chưa được tính là đã code xong chỉ vì có bảng này. Các sửa CSDL hiện tại đã có test riêng trong [audit](audits/database-20261123.md).

## 4. Người dùng cần làm gì ngay?

### A. Cập nhật rồi kiểm tra trên chính laptop

Dừng các dịch vụ; giữ thay đổi local nếu có; backup thư mục dữ liệu khi đã dừng. Cập nhật đúng nhánh và build theo [runbook](DEMO_RUNBOOK.md). Không tạo lại môi trường ASR đang hoạt động.

Chạy `npm run demo` ở terminal riêng và giữ mở. Ở terminal thứ hai chạy:

```powershell
npm run demo:check -- --warmup-asr
npm run db:check
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-ser-local.ps1
```

Gửi log ba lệnh, hoặc báo cáo JSON của DB nếu cần. Nếu launcher tự thoát, giữ log dịch vụ/exit code. Bản báo cáo môi trường mới cung cấp RAM, dung lượng trống, GPU, package và cache; số liệu “đã trống 7 GB” hoặc “4 GB VRAM” cũ chưa đủ quyết định gói cài hiện tại. Presence inventory không thay việc kiểm hash hay load model.

### B. Nghiệm thu thao tác và tốc độ thực tế

Thử một ghi âm tiếng Việt ngắn có quyền sử dụng hai lần; ghi thời lượng audio, lần đầu/lần sau mất bao lâu, lỗi transcript, RAM/VRAM nếu đo được. Thử lưu review/follow-up rồi reload và restart. Gửi ảnh ở màn hình/zoom thực dùng để chốt chữ, contrast và bố cục. Những việc này không thể xác nhận thay bằng CI trên máy khác.

### C. Dữ liệu doanh nghiệp chỉ khi muốn đánh giá ngoài tập nghiên cứu

Cần bản ghi đại diện có quyền sử dụng và nhãn đánh giá được thống nhất để công bố hiệu quả trên call center. Nếu không có, xây bộ cuộc gọi mô phỏng có kịch bản và ghi đúng “demo nghiệp vụ”. Không dùng cảm xúc dự đoán để giả lập CSAT, “tỷ lệ giải quyết” hay độ chính xác khách hàng thật. Dữ liệu nghiên cứu đang truy cập được không phải tự động trở thành dữ liệu doanh nghiệp.

## 5. Host và ngôn ngữ

Chưa cần mua VPS, tên miền hoặc GPU server để hoàn thành bản local. Frontend ở trình duyệt, API Node quản lý hồ sơ, Python giữ model trong RAM/VRAM sau khi nạp; SQLite giữ dữ liệu kết quả, không giữ weights. Nhiều checkpoint là nhiều cấu hình/thí nghiệm; có thể dùng một model active và tải khi cần, không phải một VPS cho mỗi model.

Chỉ chọn server sau khi đo memory/latency, số job đồng thời và nhu cầu truy cập ngoài. Máy CPU có thể phục vụ web/API, nhưng năng lực inference phải được đo riêng. Tách Python sang host khác còn cần truyền audio/storage chung đúng cách, auth và network boundaries. Không chỉ thay `INFERENCE_URL` rồi coi như triển khai xong. Chưa có profiling nào biện minh một đợt rewrite Rust; phần ML đang dùng runtime native và pipeline/data handling mới là các điểm cần đo trước.

## 6. Ngoài code, đồ án còn cần đủ những gì?

1. **Bài toán và phạm vi:** hỗ trợ QA tìm đoạn đáng xem trong cuộc gọi, xác nhận bằng chứng và theo dõi xử lý; không suy “khách đã hài lòng” chỉ từ nhãn cảm xúc.
2. **Cơ sở nghiên cứu:** paper cụ thể, phương pháp, nhãn, dữ liệu/split và mapping tới checkpoint đang demo; phân biệt metric nghiên cứu với KPI vận hành.
3. **Thiết kế dữ liệu/quy trình:** ERD, khóa/ràng buộc, data dictionary, ba trạng thái processing–QA–resolution, exception flows, transaction và backup.
4. **Thực nghiệm có thể kiểm tra lại:** run manifest, model/input hashes, metric theo lớp, giới hạn domain shift/ASR, lỗi tiêu biểu và số đo resource/thời gian. Không tạo số liệu từ ví dụ chọn sẵn.
5. **Nghiệm thu/demo:** kịch bản 5–7 phút, file đã chuẩn bị, xử lý lỗi/offline, hồ sơ có kết quả genuine đã tính trước được ghi imported, và phương án quay về thao tác QA khi job đang chờ.
6. **Luận văn/slide:** ảnh và sơ đồ đúng code, kết luận đúng mức bằng chứng, phần chưa triển khai được nêu rõ. Tài liệu kỹ thuật trong repo là nền để viết phần này; chưa phải cam kết luận văn cuối đã hoàn tất.
