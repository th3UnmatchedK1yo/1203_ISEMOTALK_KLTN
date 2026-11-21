# ISEmoTalk — kiểm toán đồ án và kế hoạch hoàn thiện

Ngày đối chiếu: **22/11/2026**. Code gốc: PR #5, commit `9f7ced37d7ddbf253bc7946c111662bc8732e785`. Nhánh cải tiến: `feat/thesis-demo-hardening-20261122`. Các nhánh PR trước chưa được tự động merge; nhánh mới kế thừa đầy đủ PR #5.

## 1. Đồ án giải quyết việc gì?

Bài toán ứng dụng được chọn là **hỗ trợ QA xem xét cuộc gọi tiếng Việt sau khi cuộc gọi kết thúc**. Người đánh giá cần biết đoạn nào đáng nghe lại, vì sao hệ thống gợi ý, dự đoán có đáng tin trong trường hợp cụ thể không, và vụ việc cần xử lý tiếp ra sao.

Đầu ra có giá trị là một hồ sơ gồm **ghi âm + timestamp + transcript + nguồn dự đoán + quyết định người đánh giá + hành động tiếp theo**. Một biểu đồ cảm xúc đơn lẻ chưa hoàn thành quy trình này. Trạng thái xử lý model, trạng thái duyệt QA và trạng thái giải quyết vụ việc phải tách biệt.

Câu phát biểu dùng khi bảo vệ:

> Em nghiên cứu sự phụ thuộc của nhận diện cảm xúc tiếng Việt vào tín hiệu âm thanh và văn bản khi đổi người nói hoặc corpus. Em xây dựng ISEmoTalk để đưa kết quả nghiên cứu vào quy trình QA sau cuộc gọi: người đánh giá có thể nghe lại bằng chứng, nhận ra trường hợp model hoặc transcript không đáng tin, sửa đánh giá và ghi nhận hành động nghiệp vụ. Phạm vi thực nghiệm và phạm vi ứng dụng được công bố riêng.

Giá trị phần mềm cần được đo bằng khả năng hỗ trợ tìm và kiểm tra bằng chứng, độ toàn vẹn hồ sơ và thời gian thao tác. Chưa có cơ sở để tuyên bố tăng CSAT, giảm khách rời bỏ hoặc đánh giá đúng năng lực nhân viên.

## 2. Một quy trình doanh nghiệp cụ thể

Ví dụ dưới đây là **kịch bản minh họa**, không phải dữ liệu khách hàng thu thập thật: khách gọi hỏi khoản hoàn tiền chưa về; nhân viên kiểm tra rồi hẹn phản hồi. Sau cuộc gọi, QA nhận thấy một đoạn khách thể hiện bức xúc và cần kiểm tra nội dung hẹn xử lý.

| Bước | Người/hệ thống thực hiện | Dữ liệu cần có | Phần hiện có trong đồ án |
|---|---|---|---|
| Tiếp nhận | Tổng đài/CRM | contact ID, thời điểm, queue, agent, các lần chuyển máy | Chưa tích hợp PBX; nhập mã liên hệ, tên nhân viên, thời gian và queue bằng tay |
| Lưu recording | Tổng đài/kho ghi âm | file, kênh âm thanh, thời lượng, quyền truy cập | Upload local; kiểm tra codec/duration, lưu file gắn với ID nội bộ |
| Phân tích | Worker nền | stage, đầu vào, lỗi, thời gian, adapter/model | Probe → ASR nếu cần → gán vai nếu có căn cứ → SER nếu được cấu hình → tổng hợp |
| Chọn để kiểm tra | QA | lọc nguồn dữ liệu, trạng thái, đoạn gợi ý | Danh sách và khoảnh khắc dựa trên quy tắc; thiếu vai khách phải hiển thị thiếu bằng chứng |
| Nghe và đánh giá | QA | timestamp, text gốc/sửa, dự đoán gốc, quyết định/note | Audio, transcript, nhãn QA riêng, bản nháp và optimistic version |
| Xử lý tiếp | Nhóm hỗ trợ | ticket, owner, next action, deadline, outcome | Hồ sơ xử lý độc lập, lịch sử, ràng buộc khi hẹn gọi lại/đóng vụ việc |
| Theo dõi kết quả | Vận hành | cuộc gọi lặp lại, trạng thái ticket, khảo sát | Chỉ có dữ liệu được nhập trong hồ sơ; liên kết CRM/lịch sử liên hệ là bước sau |

Mô hình contact record của Amazon Connect là một tham chiếu thực tế cho contact ID, agent, queue, timestamps và recording. Nó không có nghĩa ISEmoTalk đã kết nối Amazon Connect. Khi tích hợp sau này, phải xử lý cả một chuỗi liên hệ/chuyển máy và sự kiện gửi lại, thay vì đồng nhất một file với toàn bộ hành trình khách hàng. [Nguồn chính thức](https://docs.aws.amazon.com/connect/latest/adminguide/ctr-data-model.html).

### Định danh và trạng thái

- `callId`: ID nội bộ do allocator bền vững cấp; xóa một cuộc gọi không khiến ID được dùng lại.
- `externalContactId`: mã bên tổng đài, nhập tay hiện tại; chưa có dedup webhook hay ràng buộc duy nhất theo nhà cung cấp.
- `ticketId`: vụ việc có thể gồm nhiều lần liên hệ; hiện là trường liên kết, chưa phải CRM riêng.
- `processing`: queued/processing/ready/failed — một kết quả tính toán đã sẵn sàng hay chưa.
- `reviewStatus`: unreviewed/in_progress/reviewed — người đánh giá đã làm gì.
- `resolution`: unassessed/open/follow_up/resolved — vụ việc được xử lý tới đâu.

`ready` không tự biến thành `reviewed`; nhãn neutral/happy không tự biến thành `resolved`. Follow-up cần người phụ trách, việc phải làm và hạn. Đóng vụ việc cần ghi nhận kết quả. Tên người cập nhật trong bản local là tự khai; không được trình bày như audit có định danh đăng nhập.

## 3. Paper liên quan đến thiết kế như thế nào?

Đối chiếu paper **Acoustic–Lexical Reliance in Vietnamese Speech Emotion Recognition Across Speaker and Corpus Shifts**, bản v10.1 được cung cấp, cùng mã nguồn nghiên cứu đã kiểm tra. Ba endpoint là ba họ mô hình; không phải ba nhánh đầu ra của một checkpoint.

| Phần nghiên cứu | Thiết kế thực nghiệm cần giữ | Quyết định phần mềm có thể bảo vệ |
|---|---|---|
| RQ1 / F1: XLS-R + XLM-R, các đầu linear | Đánh giá tách người nói; kiểm tra tính bổ sung của hai nguồn | Hiển thị danh tính model, nguồn dữ liệu và đầu ra từng modality chỉ khi có head thật. Không suy từ một điểm benchmark ra tất cả cuộc gọi |
| RQ2 / B2: emotion2vec + TF–IDF logistic fusion | Giữ audio/model, thay transcript theo protocol đã đóng băng | Cho sửa transcript, giữ bản gốc và đánh dấu dự đoán cũ. Giao diện hiện chưa tự tái suy luận hay thực hiện phép can thiệp của paper |
| RQ3 / F4: emotion2vec + PhoBERT cross-attention | So sánh continuation theo ngân sách tương đương, đánh giá corpus khác | Package có checkpoint/config/factory/assets truy xuất được; chuyển sang miền call center cần đánh giá riêng |

Các hệ quả quan trọng:

1. **Audio không chỉ chứa ngữ điệu.** Embedding âm thanh có thể chứa thông tin ngôn ngữ; không được gọi đầu acoustic là phép đo cảm xúc thuần giọng nói.
2. **F4 thật chỉ có classifier hợp nhất.** Trường acoustic/lexical phải để unavailable nếu không có head riêng. Không copy fused sang hai cột đó.
3. **Điểm model không mặc nhiên là xác suất đúng đã hiệu chuẩn.** Confidence 0.9 không đủ để nói 90% khách thật sự giận.
4. **ASR demo và ASR nghiên cứu khác nhau.** faster-whisper-small đang phù hợp cho demo trên máy hiện tại; text axis trong nguồn nghiên cứu đã kiểm tra dùng PhoWhisper-base. Chuyển ASR là thay điều kiện, phải ghi nhận.
5. **Kết quả corpus nghiên cứu không là ground truth cho cuộc gọi mới.** Những tình huống tiếng ồn, giọng vùng miền, overlap, lời mỉa mai hoặc ngôn ngữ nghiệp vụ cần bộ kiểm tra riêng.

Đường dẫn source, revision và kiến trúc chính xác nằm trong [báo cáo inference/nghiên cứu](audits/inference-research-20261122.md). Source private yêu cầu quyền truy cập; public web không chứa weights hay dữ liệu nghiên cứu riêng.

### Kết luận mới về backup và checkpoint

Archive chính `SER_EXPERIMENT_BACKUP_20261007.tar(2).gz` đã được kiểm tra SHA256 đầy đủ. Chín head H5 M0/C0/M1 × seed 13/42/2026, chín metadata và sáu quan hệ parent đều khớp record lịch sử. Không cần yêu cầu gửi lại cùng chín checkpoint.

Đây là xác minh **bytes và lineage**, chưa phải chạy model. Head F4 còn cần emotion2vec, PhoBERT/tokenizer, đúng cách cắt audio, resample, precision feature, truncation và code factory. Nguồn mới `reviewer_h5_three_arm_newlineage.py` cũng phân biệt các lần chạy sensitivity 09/11 với C0/M1 tháng 10; không được dùng head tháng 10 để nhận mọi con số camera-ready sau đó là cùng artifact. Xem inventory trong báo cáo nghiên cứu.

## 4. Các lỗi có ảnh hưởng thực tế đã được xử lý

Chi tiết test và vị trí code nằm trong ba báo cáo audit; bảng này diễn giải tác động đối với người dùng.

| Vấn đề | Hậu quả trước sửa | Thay đổi |
|---|---|---|
| ID có thể tái dùng sau khi xóa | Kết quả bất đồng bộ có thể ghi nhầm sang cuộc gọi mới | Allocator bền vững; hủy/kiểm tra công việc cũ trước khi ghi |
| Lưu kết quả và checkpoint stage rời nhau | Restart/retry có thể thấy dữ liệu một phần | Transaction cho outputs + stage hoàn tất; shutdown chờ pipeline dừng |
| Response inference/import lỏng | Sai timestamp, confidence hoặc ID lọt vào DB | Kiểm tra shape, finite values, bounds, label và coverage ID |
| Vai người nói bị đoán/ghi đè | Cảm xúc nhân viên bị tổng hợp như khách | Giữ role cung cấp; role chưa xác định hiển thị unknown; không lấy người nói đầu làm agent |
| Sửa text nhưng dự đoán nhìn như mới | Hiểu nhầm model đã chạy lại | Giữ text/speaker gốc; cờ đầu vào đã đổi, nhãn QA riêng |
| Review cũ bám vào khoảnh khắc đã đổi bằng chứng | Verdict không còn nói về cùng đoạn | Gắn moment review với evidence key; giữ record cũ trong audit export |
| Request chậm/poll chồng/save đang chỉnh | Ghi đè UI hoặc mất công nhập | Key theo call; abort/generation guards; poll nối tiếp; khóa khi lưu; draft theo version |
| Đổi tab upload vẫn giữ attachment ẩn | Nhập nhầm file/transcript | Reset state và input file; backend tách field được chấp nhận |
| Text màu sáng trên badge sáng | Khó đọc nhãn cảm xúc | Chữ sẫm/nền nhạt; nhãn và controls lớn hơn; giữ theme navy/teal |
| Kiểm chứng chỉ dựa config | Weights thay mà trạng thái vẫn verified | Hash artifacts/source/manifest/audio; kiểm tra thay đổi trước, trong và sau load |
| File nén dài và decode đồng thời | Tăng RAM/đơ pipeline | Preflight duration/PCM budget; decode có giới hạn; serialize cold cache miss |
| Hồ sơ chỉ có nhãn cảm xúc | Không có hành động nghiệp vụ sau QA | Resource workflow độc lập, follow-up constraints, conflict409, history đầy đủ khi export |

Có lỗi được xem xét nhưng **không tồn tại**: route FastAPI hiện dùng `def` cho công việc đồng bộ, đã chạy ngoài event loop theo cơ chế threadpool; không cần đổi sang `async def` rồi trực tiếp chạy tác vụ CPU bên trong. [FastAPI](https://fastapi.tiangolo.com/async/).

## 5. Pipeline giữ demo ổn định

Giữ React/Vite, Node/SQLite và FastAPI local. Chưa thêm broker, microservice hay live telephony khi một laptop và một người trình bày chưa cần chúng.

- Dùng frontend production build trong buổi trình bày; API chạy không watcher. Inference vẫn là tiến trình riêng để model không chặn event loop Node.
- Một worker tuần tự để dự đoán ngân sách RAM/CPU; UI đọc progress và lỗi. Hủy ở Node chặn ghi kết quả muộn, nhưng không bảo đảm ngắt ngay kernel ML đồng bộ bên Python.
- faster-whisper CPU INT8, một worker, 4 CPU threads mặc định, beam size hiện tại. Không tải model lúc demo. Đây là cấu hình có thể đo và điều chỉnh trên máy thật, chưa có bằng chứng là nhanh nhất.
- Cache PCM một recording có giới hạn, và model đã khởi tạo trong cùng tiến trình. `warmup` chỉ nạp model; file suy luận đầu tiên vẫn cần chạy trước để kiểm tra cold path thực tế.
- Audio clock nằm ở component nhỏ; transcript rows được memo hóa. Tính payload sửa theo O(n), không normalize cả transcript cho từng câu. Chưa virtualize transcript rất dài.
- Trường hợp kết quả model đã tính trước: nhập kèm audio và nguồn; UI phải giữ nhãn `imported`, không gọi đó là inference vừa chạy.

Giới hạn mặc định PCM 256 MiB áp dụng trước giới hạn thời lượng 3 giờ trong nhiều trường hợp. Stereo kèm mono mix ở 16 kHz có thể chạm budget sau khoảng 23 phút. Đây không phải giới hạn tổng RAM process. Cho demo, chuẩn bị đoạn ngắn rõ lời và một hồ sơ đã xử lý để phân biệt thời gian chờ model với thao tác QA. [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

### Chỉ tiêu phải đo, không tự điền

| Tầng | Phép đo | Cách tránh kết luận sai |
|---|---|---|
| ASR | WER/CER, thời gian cold/warm, audio duration | Có transcript tham chiếu; ghi model, ngôn ngữ, phần cứng |
| SER | Macro-F1/UAR, confusion matrix, support từng lớp | Speaker/call split; không dùng clip cùng cuộc gọi ở cả train/test |
| Phục vụ | elapsed/duration (RTF), stage time, RAM/VRAM, p50/p95 | Tách init khỏi inference; ghi cỡ mẫu; không dùng mock để tuyên bố ML nhanh |
| QA | time-to-first-relevant-segment, thời gian review, precision@k | Cùng nhiệm vụ và tập audio; hoán đổi thứ tự giữa người để giảm learning effect |
| Chất lượng hồ sơ | mất draft, conflict đúng, export đủ, retry an toàn | Tình huống lỗi có chủ đích và dữ liệu kiểm thử |
| Kết quả nghiệp vụ | tỷ lệ gọi lại đúng hạn, outcome được xác nhận | Cần timestamp/outcome thực; chưa suy được từ emotion |

Mẫu nhỏ chỉ là pilot. Đề xuất 20–30 cuộc gọi có phép sử dụng để kiểm tra quy trình, với nhãn độc lập từ hai người và cách xử lý bất đồng; chưa đủ để tuyên bố độ chính xác đại diện toàn contact center. Quy mô thống kê cuối cùng phụ thuộc mục tiêu, biến thiên và độ rộng khoảng tin cậy.

## 6. Những tính năng nên làm tiếp để tôn đóng góp SER

### Ưu tiên 1 — model thật có nguồn gốc rõ ràng

Khôi phục một cấu hình F4 được chọn có lý do từ protocol; không chọn seed bằng cách xem kết quả test. Tạo factory sử dụng đúng encoder và tokenizer, tái lập feature trên mẫu tham chiếu, kiểm tra prediction parity, rồi sanity-check bốn lớp và đo tài nguyên laptop. Nếu chọn F1/B2 để phục vụ, cần fitted scaler/head/vectorizer thật của đúng model. Đây là nút thắt chính, hơn việc thêm dashboard.

Trước khi bật SER thật, cần đưa digest của package/config đã load vào bằng chứng từng inference run; hiện stage evidence ghi adapter/model/device/mock/verified, chưa đủ phân biệt hai seed dùng cùng một factory.

Tiêu chí xong: package hash/lineage được ghi, output phù hợp reference trong sai số định trước, mẫu held-out qua kiểm tra, giới hạn tài nguyên đã đo, UI gọi model thật và không hiện đầu ra không có.

### Ưu tiên 2 — so sánh có kiểm soát trước/sau sửa transcript

Thêm thao tác **chạy lại trên bản transcript đã sửa** khi factory thật sẵn sàng. Lưu `inference_run_id`, input hash, transcript version, model/package hash, thời gian và output mới bên cạnh output cũ. Đây mới là cầu nối thực nghiệm rõ nhất với RQ2. Hiện tại sửa text chỉ đánh dấu dự đoán cũ; chưa có rerun phiên bản hóa.

### Ưu tiên 3 — vòng phản hồi QA phục vụ nghiên cứu

Dataset xuất riêng gồm model prediction và nhãn QA, không tự coi mọi lần sửa là gold label. Bổ sung trạng thái đồng thuận/adjudication, nhãn không chắc chắn ngoài không gian bốn lớp nếu quy trình gán nhãn cần, kiểm tra role và chất lượng audio. Reviewer corrections chỉ tham gia tập huấn luyện mới sau rà soát; tránh rò rỉ tập test và vòng tự xác nhận model.

### Ưu tiên 4 — hàng đợi nghiệp vụ có thể đo

Bổ sung lọc theo resolution/owner/deadline và danh sách follow-up quá hạn khi có dữ liệu thật. So sánh hàng đợi có gợi ý SER với chọn ngẫu nhiên/theo thời lượng cùng ngân sách review. Nhãn cảm xúc thay đổi có thể là lý do chọn đoạn, nhưng không tự chứng minh câu trả lời của agent gây ra thay đổi.

### Ưu tiên 5 — triển khai nhiều người dùng

Đăng nhập/phân quyền, danh tính reviewer xác thực, audit event chống sửa, retention/xóa recording, giới hạn concurrent jobs, job leases, backup/restore và quan sát lỗi. PBX/CRM integration cần idempotency key và ánh xạ external ID/leg IDs. Chỉ làm sau khi đã có model và quy trình QA đáng tin, không cần để hoàn thành buổi báo cáo local.

## 7. Giao diện và tiêu chí duyệt

Hệ màu chính: nền sáng, chữ navy đậm, accent teal; màu cảm xúc dùng để phân biệt nhãn và đi kèm chữ. Không thêm gradient trang trí, KPI không có dữ liệu, icon khổng lồ hoặc các card lặp lại không hỗ trợ quyết định.

Thứ tự đọc: danh tính cuộc gọi → recording/timestamp → lời nói và bằng chứng → quyết định QA → hồ sơ xử lý. Body desktop giữ 18px; những badge quan trọng đổi sang foreground sẫm. Tính tương phản màu không thay thế kiểm tra layout thực tế. Mục tiêu chữ thường tối thiểu 4.5:1 theo [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); chưa tuyên bố toàn ứng dụng đạt WCAG.

Cần duyệt trên màn hình trình chiếu thực: 1366×768, 100%/125% zoom, và một viewport hẹp; đọc nhãn, tìm nút lưu, điều hướng bàn phím, focus, scroll bảng, nghe/seek audio. Môi trường hiện tại không cho trình duyệt truy cập app local nên **chưa có xác nhận bằng screenshot thực tế**. Build và test logic không thay bước này.

## 8. Bằng chứng và phần còn mở

Kết quả kiểm thử cuối, integration HTTP, review độc lập và giới hạn môi trường được chốt tại [IMPLEMENTATION_LEDGER_20261122.md](IMPLEMENTATION_LEDGER_20261122.md). Báo cáo từng lớp giữ các mốc kiểm thử ban đầu; ledger là bằng chứng tích hợp sau cùng.

Phần còn mở cần trung thực: kiểm tra browser trên laptop; chạy thật và đo ASR đang cache; khôi phục full SER; đánh giá miền call center; backup/restore với dữ liệu sử dụng thật. Đóng PR code không đồng nghĩa các phần nghiên cứu/triển khai này đã hoàn thành.
