# ISEmoTalk — ONE flow (23/11/2026)

## Người dùng vận hành

Sau **một lần cập nhật source** trong VS Code (Source Control → Pull), mở thư mục web và nhấp đúp **`ISEmoTalk.cmd`**. KHÔNG phải mở nhiều cửa sổ CMD rồi nhập thủ công lệnh khởi động model.

Trình mở sẽ tự: (1) build React hiện tại, (2) tạo SSH tunnel qua alias `ftisu-ser`, (3) sử dụng hoặc khởi động Express API và FastAPI Python trên FTISU (các cổng loopback riêng 3102/8102 để không đè bản preview cũ), (4) kiểm tra XLM-R thật và checkpoint, (5) mở web ở `http://127.0.0.1:5174`. Log kiểm tra cục bộ lưu ở `.isemotalk-launcher/`; thư mục này bị Git ignore.

**Điều kiện chuẩn bị một lần:** máy Windows có Node.js 22, OpenSSH + alias `ftisu-ser` đã đăng nhập bằng SSH key, repo web đã cập nhật; FTISU có Node, serving `inference/.venv` CUDA, SQLite speech-demo, checkpoint XLM-R đã train và được cấp quyền, Git remote truy cập được. Trình mở **không cài trộm model, không bật GPU mock, không ghi đè DB, không dừng dịch vụ người khác**. Nếu thiếu dependency/SSH/weights, nó báo lỗi rõ và không khẳng định inference thành công. Đây là lối mở một cú nhấp cho môi trường FTISU đã chuẩn bị, **không phải** website production công khai hay một dịch vụ tự chạy 24/7.

## Flow nghiệp vụ trên web

1. **Cuộc gọi**: Mặc định chỉ hiện bộ hồ sơ CSKH (OneVoice và những cuộc gọi do người dùng nhập/tải lên). Các clip nghiên cứu FLEURS/FOSD/DataHive được chuyển sang bộ lọc **Mẫu thử ASR / DataHive**, không bị xóa.
2. **Nhận bản ghi**: Hồ sơ OneVoice cũ giữ nguyên WAV + transcript nguồn, dữ liệu TTS theo kịch bản. Với file mới, upload qua trình duyệt và đưa vào queue. ASR PhoWhisper chạy nếu cache checkpoint đã được cài, không có thì yêu cầu transcript có timestamp; không tạo chữ từ audio bằng thủ thuật giả.
3. **Phân tích**: Hệ thống tự gọi XLM-R QA cho các cuộc gọi đủ điều kiện khi transcript có sẵn, chạy tuần tự trên FTISU, lưu SHA256 checkpoint và fingerprint transcript. Không có nút Chấm QA từng cuộc bắt buộc. Các kết quả đã nhập OneVoice trước đó tự được sàng lọc sau khi mở backend. **Mô hình QA này học nhãn synthetic, không phải đánh giá nhân viên thật.**
4. **Giới hạn token**: Bản cũ chỉ đọc prefix 256 token; các kết quả cũ bị cắt được tự đánh dấu lỗi thời và tính lại bằng **sliding windows**, quét từ đầu đến cuối (tối đa 48 cửa sổ; vượt quá giới hạn thì báo không bao phủ toàn bộ). Điểm max-window là **heuristic chưa hiệu chuẩn và chưa đánh giá độc lập**, không phải xác suất call-level đã được kiểm chứng.
5. **QA xác minh**: Mở cuộc gọi, nghe file, đối chiếu nội dung. Transcript OneVoice hiển thị đúng thành nhiều lượt chat `agent/customer`, nhưng **không tự bịa timestamp hoặc diarization**: chúng là vai trò do kịch bản cung cấp. Người QA ghi nhận quyết định và có thể tạo **vụ việc + nhiệm vụ** khi cần xử lý tiếp.
6. **Theo dõi**: Sau khi người chịu trách nhiệm cập nhật tình trạng, QA xác nhận hoàn tất/đóng vụ việc; dữ liệu vụ việc và lịch sử được lưu trong SQLite. AI không tự đóng ticket hay khẳng định khách hàng đã hài lòng.

## Case trình bày với thầy: VinID OTP, đoạn nguồn OneVoice

**Đầu vào thực tế từ screenshot CALL-0002**: khách báo số điện thoại bị hệ thống nhận là đã tồn tại; không nhớ mật khẩu, OTP bị hết hạn hoặc không nhận được; nhân viên hướng dẫn thử lại và cài app, cho biết không can thiệp được mã OTP; khách yêu cầu gặp quản lý, không gặp được, đòi khiếu nại. Đây là dữ liệu OneVoice **TTS tổng hợp, không phải ghi âm CSKH người thật**.

**Vấn đề QA**: không phải “giọng có tức giận hay không” đơn lẻ. Cần đánh giá: yêu cầu khách đã được giải quyết hay chưa, hướng xử lý OTP có hợp lý không, có phương án chuyển cấp quản lý rõ chưa, ai phải liên hệ lại, khi nào hoàn thành. QA review xem xét bằng chứng gốc, đặt follow-up/case nếu thực sự cần.

**Sai số minh họa**: XLM-R prefix-only từng gợi ý 4,9% và hiện cảnh báo transcript quá dài. **Không** dùng 4,9% để nói cuộc gọi bình thường vì phần cuối escalation bị bỏ ngoài input. Sau sửa, model xử lý theo cửa sổ; kết quả phải đo lại trên FTISU, không tự đoán ra score mới. Nếu heuristic vẫn dự đoán sai, báo lỗi mô hình thẳng thắn và để reviewer chỉnh quyết định, không bịa accuracy.

## Ranh giới khoa học

- XLM-R binary `needs_attention` dựa vào **text**, không phải mô hình SER bốn cảm xúc.
- SER F4 từ nghiên cứu dùng emotion2vec/PhoBERT/cross-attention; **chưa có bằng chứng verified serving trên FTISU**: dashboard không vẽ timeline cảm xúc giả, không tự gán `angry` cho khách chỉ vì họ khiếu nại.
- Model đã được train + code đã PASS CI không chứng minh GPU inference thực sự đã chạy; chỉ xác nhận sau smoke/health trên FTISU và mẫu WAV được phép sử dụng.
- OneVoice non-commercial CC BY-NC-SA 4.0 theo manifest nguồn; không quảng cáo đây là bộ QA chuẩn doanh nghiệp.

## Khi gặp lỗi

Trình mở giữ kết quả cũ trong DB, không tự chuyển sang mock. Xem dòng báo lỗi trên cửa sổ vừa mở và file `.isemotalk-launcher/gpu.log` hoặc `web.log` nếu có. Nếu checkpoint PhoWhisper chưa có trong cache, phần QA text vẫn được phục vụ (không giả ASR). Nếu checkpoint QA hoặc CUDA không khả dụng, launcher từ chối chế độ inference thật; cần giải quyết dependency bằng người quản trị server trước khi chấm.
