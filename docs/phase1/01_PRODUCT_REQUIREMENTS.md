# ISEmoTalk — Phase 1: Product requirements and business discovery

Ngày: 2026-11-25 | Phiên bản: 0.1 — đề xuất cần nghiệm thu nghiệp vụ | Không phải báo cáo tính năng đã chạy.

## 1. Quyết định sản phẩm

ISEmoTalk là ứng dụng web desktop-first phân tích cuộc gọi tiếng Việt sau khi kết thúc, ưu tiên sàng lọc có bằng chứng, hỗ trợ QA và theo dõi vấn đề khách hàng. SER là đóng góp nghiên cứu: kiểm tra xem tín hiệu âm học bổ sung cho nội dung văn bản có cải thiện khả năng tìm cuộc gọi/đoạn cần nghe hay không. Không phải tổng đài, CRM hoàn chỉnh, công cụ giám sát cảm xúc nhân viên hay hệ thống tự ra quyết định kỷ luật.

Phạm vi pilot được đề xuất: tổng đài CSKH inbound thương mại điện tử/giao nhận tại Việt Nam, quy trình hỏi đơn hàng, giao trễ, đổi/trả, hoàn tiền, khiếu nại, hẹn gọi lại. Một tổ chức trong bản pilot; thiết kế quyền và dữ liệu theo workspace để có thể mở rộng. Chưa có xác nhận của doanh nghiệp đối tác, đây là giả thuyết cần kiểm chứng. Mô hình có thể phục vụ miền khác sau khi hiệu chỉnh và đánh giá riêng.

### Bài toán

QA không thể nghe lại mọi cuộc gọi; lấy mẫu ngẫu nhiên có thể bỏ qua sự cố hiếm. Transcript giúp tìm nội dung nhưng có thể mất thông tin giọng nói. Người quản lý cần kết quả có thể hành động, không chỉ biểu đồ vui/buồn. Mỗi cảnh báo phải có lý do, đoạn bằng chứng, nguồn và trạng thái xác minh. Người dùng có thể bỏ qua AI, nghe bản gốc và kết luận độc lập.

### Non-goals

- Không thực hiện cuộc gọi, gọi lại tự động, quyết định hoàn tiền hoặc ghi CRM tự động.
- Không suy ra cảm xúc nội tâm, sự hài lòng, nhân cách, bệnh lý, năng lực hay lỗi nhân viên từ giọng nói.
- Không chấm điểm công việc dựa trên SER; không dùng nhãn cảm xúc nhân viên cho quyết định tuyển dụng/kỷ luật.
- Không khẳng định FCR/CSAT, trạng thái giao hàng/hoàn tiền nếu thiếu dữ liệu nghiệp vụ.
- Không real-time, voicebot, nhận diện danh tính qua giọng nói, hỗ trợ mọi ngành/ngôn ngữ trong MVP.
- Không đưa model/dataset riêng tư vào repo public. Không gọi việc có GPU hay API là bằng chứng hiệu năng.

## 2. Bằng chứng thị trường và hàm ý thiết kế

| Sản phẩm/tài liệu | Nghiệp vụ được mô tả công khai | Quyết định ISEmoTalk |
|---|---|---|
| FPT AI Enhance [1] | Bóc băng, tải hàng loạt, mẫu chấm điểm tùy quy trình, danh sách bất thường, báo cáo | Từ khóa, phiên bản checklist, bằng chứng và công việc thực tế; không sao chép số liệu quảng cáo |
| Amazon Connect Contact Lens [2–3] | Rule dựa trên từ khóa/ngữ nghĩa, hold/non-talk, sentiment theo thời gian; evaluation form | Tách quy tắc sàng lọc và đánh giá; ghi nguồn tín hiệu và phiên bản rule |
| NiCE Quality Planner [4] | Lấy mẫu theo filter, giao reviewer, gắn form | Có random audit để kiểm tra cả cuộc không bị AI cảnh báo; giao nhiệm vụ |
| Genesys Quality Management [5–6] | Evaluation, calibration, rescore, dispute, coaching, topics | Review có lịch sử, bất đồng và QA calibration; không biến dự đoán AI thành điểm chính thức |
| Nghiên cứu cross-corpus SER [7–8] | Hiệu năng có thể suy giảm khi khác corpus, phong cách nói, môi trường | Kiểm chứng model trên thoại đích; âm thanh là nguồn bằng chứng bổ trợ, không phải sự thật tuyệt đối |

Không suy ra rằng các hãng đang sử dụng cùng SER architecture hoặc hỗ trợ tiếng Việt ở mọi tính năng. Không có dữ liệu nội bộ vendor hay phỏng vấn thực địa ở Phase 1.

## 3. Vai trò và quyền

| Role | Công việc | Quyền dự kiến |
|---|---|---|
| Intake/operator | Nhập batch, kiểm tra lỗi metadata/audio | Tạo batch; xem job và call trong queue được cấp quyền; không train |
| QA reviewer | Xác minh cảnh báo, nghe lại, chấm checklist, ghi nhận outcome | Đọc audio/transcript trong phạm vi; sửa draft/submit review; không thay model/rule |
| Supervisor | Quản lý queue, phân công, duyệt đánh giá, theo dõi follow-up, báo cáo | Assign, reopen, adjudicate, tạo form/rule version; không tự sửa log |
| Case owner | Xử lý việc cần theo dõi bằng hệ thống doanh nghiệp bên ngoài | Đọc case được giao, cập nhật hành động và bằng chứng outcome; không sửa SER |
| AI/data admin | Curate data, đánh giá model, phê duyệt candidate | Quản lý model/dataset với quyền dữ liệu riêng; không mặc nhiên đọc mọi cuộc gọi |
| Workspace admin | Users, access, retention, audit | Quản lý cấu hình, không mặc nhiên được train bằng dữ liệu khách hàng |

Một người có thể kiêm nhiều vai ở pilot. Role là yêu cầu, không phải khẳng định đã có RBAC. Mọi endpoint phải kiểm tra workspace và quyền ở server, không chỉ ẩn nút.

## 4. Quy trình từ đầu tới cuối

1. Operator nhập recording hoặc CSV metadata liên kết file. Bắt buộc: file, workspace, nguồn/quyền xử lý; mã ngoài, ngày gọi, queue, mã ticket, kênh người nói tùy dữ liệu. Không yêu cầu tên thật hoặc số điện thoại nếu không cần.
2. Server xác minh format, hash, dung lượng, decode, timebase; lập batch và job ID; chỉ báo upload thành công khi ghi bền vững. Có kết quả từng file, retry an toàn và không trùng task.
3. Worker xử lý quality/VAD, ASR, diarization/role evidence, SER và nội dung theo stage. Một stage lỗi không biến toàn bộ output thành kết quả giả. Partial outputs mang trạng thái và version; không đánh đồng thiếu output với neutral.
4. Phân tích theo utterance/turn, tính các tín hiệu có đủ điều kiện và tạo finding chứa evidence span, lý do, source, version, mức ưu tiên, hạn nếu có. Các finding từ cùng rule/sự kiện gộp vào task phù hợp.
5. Work Inbox hiển thị những việc cần làm trước, có hàng đợi Follow-up, QA, AI/data verification và Random audit. Supervisor giao việc, reviewer nhận/claim; nhiều task của cùng cuộc gọi được nhóm thay vì đếm trùng.
6. QA mở review, nghe từ timestamp, kiểm tra ASR/role, xác minh finding, trả lời checklist, ghi chú, chọn outcome hoặc không đủ bằng chứng. Lưu draft; submit với version check. Mỗi câu đánh giá có chứng cứ hoặc lý do không đánh giá được.
7. Nếu có hành động sau cuộc gọi, tạo case, chỉ định owner, due date, action. Người phụ trách xử lý thực tế ngoài ISEmoTalk, ghi nhận evidence/reference, đóng hoặc mở lại. Hoàn tất QA không đồng nghĩa đóng case.
8. Báo cáo phân biệt analyzed/partial/failed, review coverage, follow-up SLA, topic, rule, nguồn model, các mẫu đã xác minh. Không suy diễn số đo không có dữ liệu.
9. Feedback tách nhãn emotion, transcript, role, relevance, outcome/checklist. Chỉ mẫu có quyền train và nhãn đã kiểm duyệt đi vào dataset candidate. Admin tạo version, huấn luyện ngoài luồng inference, đánh giá rồi approve/rollback.

### State machine (độc lập)

- Analysis job: RECEIVED → QUEUED → RUNNING → READY | PARTIAL | FAILED; retry tạo attempt mới cùng job; cancel yêu cầu được ghi lại, không xóa kết quả đã công bố. READY nghĩa là hoàn tất các stage bắt buộc cho cấu hình; không đồng nghĩa mọi model đáng tin.
- QA task: OPEN → ASSIGNED → IN_REVIEW → SUBMITTED → ACCEPTED hoặc NEEDS_REVISION; có REOPENED/CANCELLED với lý do. Có thể lưu review khi partial nếu reviewer có bằng chứng, không được giả lập phần AI bị thiếu.
- Follow-up case: OPEN → ASSIGNED → IN_PROGRESS → WAITING → RESOLVED | CLOSED_NO_ACTION; OVERDUE là cờ theo deadline, không phải kết quả. REOPENED khi phát sinh thông tin mới.
- Feedback: DRAFT → SUBMITTED → VALIDATED | REJECTED → ELIGIBLE/INELIGIBLE → INCLUDED_IN_DATASET_VERSION. Không cập nhật production weights ngay khi click.
- Model: CANDIDATE → EVALUATED → APPROVED → ACTIVE → RETIRED; rollback atomic. Lịch sử output luôn gắn version cũ.

## 5. Output contract tối thiểu

- Call: call_id, workspace_id, source, external_contact_id nếu có, capture date/timezone, recording_asset_id, checksum, queue, ticket reference, processing state, ingestion batch, quyền xử lý/retention.
- Segment: segment_id, start_ms/end_ms (cùng timebase audio gốc), speaker_cluster, verified_role/role_source, overlap/quality flags, transcript_raw, transcript_revision, model version, optional ASR alignment quality.
- SER: nullable acoustic/lexical/fusion probability vectors 4 lớp, label, score, model/version, input transcript revision, audio segment identity, abstain_reason. Nếu chỉ có head fusion thì hai output kia null; không dùng score fusion thay thế unimodal. Tách uncertainty khỏi nhãn lớp.
- Finding: ID, call/segment, rule_id/version, category, evidence time range và source, raw signal/threshold, provisional priority, reviewer verdict (unverified/relevant/not relevant/insufficient evidence), links to model run/review. Không gọi confidence là xác suất đúng khi chưa calibration.
- QA review: reviewer, form version, answers, references, notes, decision, optimistic version, audit timestamps; lưu riêng human label và AI original.
- Case: owner, due_at, reason, next_action, outcome, external evidence, history.
- Dataset/model registry: sample lineage/rights, label review, corpus split, artifact digest, training config/eval report, approver, activation/rollback event. Không xuất nội dung nhạy cảm theo mặc định.

## 6. Điều hướng và UX

Trang mặc định là Công việc (Work Inbox), không phải dashboard nghiên cứu. Người QA thấy những việc cần làm ngay; Supervisor có Tổng quan và Báo cáo; Admin có Dữ liệu & AI/Cài đặt.

| Screen | Mục tiêu và thao tác chính |
|---|---|
| Work Inbox | Tab Follow-up/QA/AI verification/Random audit; filter queue/date/source/status/assignee, search; mỗi row reason, evidence time, priority, owner, due, coverage; claim/open; lưu filter khi quay lại |
| Thêm bản ghi | Batch drag/drop, metadata CSV tùy chọn, consent/rights, lỗi từng file, tiến độ stage, retry, tóm tắt batch, đi tới Inbox; không chọn checkpoint |
| Chi tiết cuộc gọi | Header reason/status/source; audio sticky + seek/tốc độ; transcript có time và speaker; finding cards bấm nhảy mốc; side panel checklist/case; Advanced AI thu gọn mặc định; keyboard/accessibility |
| Phiếu QA | Pass/Fail/Not assessable/Not applicable, timestamp/source, note, save draft/submit; giữ input khi lỗi/conflict; xác nhận khi thoát với draft |
| Vụ việc | Owner, deadline, hành động, lịch sử, link call/ticket, close/reopen |
| Báo cáo | Date/queue/rule/version/source, counts và denominators, trend và export theo quyền; drill-down tới call; không trộn mock/synthetic với real |
| Admin | User/permission, policy/form/rule versions, data consent/retention, annotation, model evaluation/release history; chức năng chưa triển khai không hiện như đang hoạt động |

Layout desktop detail: audio/timeline sticky ở trên, transcript/evidence trái, finding + review phải. Nút chính có một mục đích, thuật ngữ tiếng Việt đơn giản. Màu nâu-be chỉ là theme; không dùng màu làm dấu hiệu trạng thái duy nhất. Tối ưu 1280x720 và zoom 125%, mobile đọc cơ bản; QA nghe/chấm chủ yếu desktop. Không giả lập waveform khi audio không có; không làm chart trang chủ thay công việc.

## 7. Phạm vi ưu tiên theo release

| ID | Must — pilot có thể vận hành một tổ chức | Acceptance liên kết |
|---|---|---|
| FR01 | Batch upload, metadata, duplicate, provenance, processing status, retry | AC01–AC08 |
| FR02 | ASR, timestamp playback, role evidence/unknown, audio quality, partial outputs | AC09–AC17 |
| FR03 | SER có nhãn và abstention, feature availability, model run provenance, uncertainty | AC18–AC22 |
| FR04 | Rules + evidence, queue separation, random audit, assign/dedup | AC23–AC29 |
| FR05 | QA checklist, confirm/reject/unknown, draft, concurrency, escalation/adjudication | AC30–AC34 |
| FR06 | Follow-up with owner/due/outcome and history | AC35–AC37 |
| FR07 | Search, reports, export with source/coverage, role-based access | AC38–AC43 |
| FR08 | Consent/retention/deletion/audit/backup controls | AC44–AC47 |
| FR09 | Verified feedback, dataset candidate/version and controlled model promotion/rollback | AC48–AC52 |
| FR10 | Observable jobs, bounded resources, measurable latency and UX | AC53–AC58 |

Should after core works: webhook/PBX connector, CRM read-only sync, multi-label topic model, advanced search, multi-tenant deployment, distributed worker pool, advanced cohort dashboards. Could: near-realtime, additional languages, external notifications. Won't in thesis baseline: autonomous customer decisions, automatic employment evaluation from SER.

## 8. NFR and deployment boundaries

- Pilot: authenticated internal web behind access boundary; private audio/model storage, HTTPS when networked. Keep remote GPU workers separate from public web; no credentials in repo/log.
- Reliability: durable job identity; idempotency, bounded retries, backpressure; backup/restore tested; stage provenance and errors visible.
- Privacy: lawful basis/notice/permission from organization, purpose-specific train opt-in/authorization where appropriate; minimize PII, redact exports, retention and deletion across derived artifacts/backups, audit access. See Vietnamese Law 91/2025/QH15 and Decree 356/2025/NĐ-CP (effective 2026-01-01). Legal assessment and actual policy approval required before real customer pilot.
- Observability: queue depth, age, stage durations, failures, retries, model/version, resource usage; logs contain IDs not raw transcript/secrets.
- Performance hypotheses for later measurement, not proven SLA: paginated lists p95 under 2s on pilot-size indexed database; seek playback within 1s on LAN after metadata loaded; batch of 100 recordings no lost/duplicate jobs; report actual throughput and p50/p95 for audio durations, GPU concurrency, queue wait and failure recovery. Choose deployment capacity after measurement.
- Accessibility: visible focus, keyboard playback/selection, text status, readable labels, clear empty/error/loading, no color-only alerts.
- Data isolation: even in single-workspace pilot, authorize server-side. Multi-workspace claims require cross-tenant tests.
- SER must not automate employment decisions or identify private mental states. Customer expression is tentative and may be wrong, accent/language/channel limitations explicit.

## 9. Product & research success

Primary business objective: more independently validated actionable calls found at the same human review budget, or less review time at comparable recall, without unjustified punitive decisions. Metrics and benchmark policy in 03_VALIDATION_AND_DISCOVERY.md. A high F1 on a source corpus is not proof of customer-service value.

## 10. Sources (public, accessed 2026-11-25)

1. FPT AI Enhance: https://fpt.ai/vi/san-pham/fpt-ai-enhance/ ; https://fpt.ai/vi/giai-phap/quan-ly-chat-luong-tong-dai/
2. Amazon Connect rules: https://docs.aws.amazon.com/us_us/connect/latest/adminguide/build-rules-for-contact-lens.html
3. Amazon Connect evaluation: https://docs.aws.amazon.com/connect/latest/adminguide/create-evaluation-forms.html
4. NiCE Quality Planner: https://help.nicecxone.com/content/qmanalytics/qp/qualityplanner.htm
5. Genesys quality: https://help.genesys.cloud/articles/about-quality-management/
6. Genesys analytics: https://help.genesys.cloud/articles/speech-and-text-analytics-overview/
7. Kawaoto et al. (2025), Performance Gaps in Acted and Naturalistic Speech, https://doi.org/10.26615/978-954-452-098-4-061
8. Deep Cross-Corpus Speech Emotion Recognition survey: https://pmc.ncbi.nlm.nih.gov/articles/PMC8666588/
9. Vietnam law: https://vanban.chinhphu.vn/?docid=214590&pageid=27160 ; decree: https://vanban.chinhphu.vn/?docid=216387&pageid=27160
10. NIST AI RMF Core: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
