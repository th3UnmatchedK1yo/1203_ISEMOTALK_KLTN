# ISEmoTalk — Luồng nghiệp vụ trình bày giữa kỳ (23/11/2026)

## Mục tiêu và người sử dụng

ISEmoTalk là hệ thống hỗ trợ **kiểm tra chất lượng cuộc gọi sau khi cuộc gọi đã kết thúc**. Người sử dụng chính là nhân viên QA, không phải khách hàng gọi tổng đài. Hệ thống giúp họ tìm cuộc gọi cần chú ý, nghe lại bằng chứng và ghi nhận hướng xử lý. ISEmoTalk không thay thế tổng đài, không tự gọi điện, không tự hoàn tiền và cũng không tự đánh giá nhân viên có lỗi.

## Quy trình vận hành

**Tiếp nhận cuộc gọi.** Sau khi kết thúc cuộc gọi, QA hoặc người được phân quyền đưa file ghi âm và thông tin liên quan vào hệ thống. Mỗi bản ghi có mã riêng, nguồn dữ liệu, thời lượng và trạng thái xử lý. Với dữ liệu demo OneVoice, file WAV và transcript nguồn được nhập sẵn từ dataset; không được gọi đây là kết quả ASR vừa chạy hay một cuộc gọi CSKH thật.

**Phân tích tự động.** Nếu nguồn chưa có transcript, hệ thống cần mô hình ASR để chuyển lời nói thành văn bản. Vai trò nhân viên/khách hàng chỉ được gán khi có căn cứ; OneVoice cho biết vai trò theo kịch bản nhưng chưa có timestamp riêng từng lượt. Khi transcript đã có và runtime XLM-R QA hoạt động, worker tự sàng lọc nội dung để gợi ý cuộc gọi nào nên được QA xem trước. Đây là điểm sàng lọc, không phải kết luận nhân viên sai. SER audio–text fusion F4 sẽ là bằng chứng bổ sung khi checkpoint và quá trình suy luận được xác minh; hiện chưa được bật trong bản QA-only nên không hiển thị màu cảm xúc giả.

**Xếp hàng đợi xem xét.** Màn hình Cuộc gọi ưu tiên hiển thị các hồ sơ có tín hiệu cần xem, rồi đến những cuộc chưa có kết quả AI. QA có thể đổi sang thứ tự thời gian hoặc tìm theo mã. DataHive và các clip thử ASR được giữ riêng, không đưa vào hàng đợi CSKH mặc định. Một cuộc gọi không có điểm cảnh báo mạnh vẫn có thể có vấn đề; người làm QA không được bỏ qua hoàn toàn chỉ vì model dự đoán “routine”.

**QA nghe và xác minh.** Người đánh giá mở hồ sơ, phát audio, đọc transcript dạng chat và đối chiếu đề xuất AI. Họ kiểm tra khách hàng đang cần gì, nhân viên đã phản hồi ra sao, có lời hứa gọi lại hoặc chuyển cấp chưa được thực hiện hay không. Người QA có thể bổ sung ghi chú và lưu kết luận. Nếu thiếu đầu vào hoặc model chưa chạy, web phải nói rõ phần nào chưa có kết quả; không tự sinh nhãn thay thế.

**Tạo vụ việc và giao xử lý nếu cần.** Nếu QA thấy yêu cầu chưa giải quyết hoặc có sai lệch nghiệp vụ, họ tạo hoặc liên kết vụ việc, mô tả nội dung cần xử lý, giao công việc cho người phụ trách và đặt thời hạn. Người được giao cập nhật các lần liên hệ, kết quả và tình trạng công việc. Nếu khách không nghe máy, ghi nhận lần thử và hẹn lại; không coi đó là đã xử lý xong. Khi gọi lại thành công thì hoàn thành công việc gọi lại, nhưng **vụ việc chỉ được đóng khi vấn đề thực chất đã được giải quyết và có người chịu trách nhiệm xác nhận**.

**Báo cáo và truy vết.** Hệ thống giữ đánh giá của QA, trạng thái vụ việc, nhiệm vụ và lịch sử cập nhật trong cơ sở dữ liệu, hỗ trợ theo dõi các công việc còn mở. Dự đoán model và quyết định con người phải được phân biệt để có thể kiểm tra lại sau này.

## Minh họa bằng tình huống VinID trong dữ liệu OneVoice

Trong một bản ghi, khách hàng gọi vì không đăng nhập được ứng dụng VinID dù cho rằng mình nhập đúng mật khẩu. Sau nhiều lần thử, tài khoản bị khóa tạm thời. Nhân viên hướng dẫn thử lại nhưng khách vẫn chưa có giải pháp thỏa đáng. Theo nội dung bản ghi, QA cần xem kỹ **vấn đề tài khoản đã được giải quyết chưa, nhân viên có cung cấp đường hỗ trợ phù hợp không và liệu có cần chuyển cấp hay liên hệ lại**.

Hệ thống tự đưa transcript vào bước sàng lọc XLM-R khi model đã nạp. QA không dựa vào điểm số một cách máy móc; họ nghe đoạn trao đổi và xác minh khách còn gặp khó khăn. Nếu xác nhận vấn đề chưa được xử lý, QA ghi kết luận và mở vụ việc để bộ phận chịu trách nhiệm kiểm tra tài khoản, liên hệ khách và ghi nhận kết quả. Khi có bằng chứng đã xử lý, QA mới hoàn tất vụ việc.

Đây là **tình huống thử nghiệm quy trình** bằng OneVoice TTS, không phải số liệu thực tế của doanh nghiệp. Điểm sàng lọc từ XLM-R (kể cả quy tắc lấy điểm cao nhất theo nhiều cửa sổ token) chưa được hiệu chuẩn trên ghi âm tổng đài thật. Không lấy ví dụ này để tuyên bố hệ thống đã giảm khiếu nại hay tăng năng suất QA.

## Bản nói ngắn (khoảng một phút)

> “Đồ án của em hướng đến công việc kiểm tra chất lượng sau cuộc gọi, không phải xây một ứng dụng để gọi điện. Sau khi có file ghi âm, hệ thống lưu lại cuộc gọi, tạo transcript nếu có mô hình ASR khả dụng, rồi tự dùng XLM-R để gợi ý hồ sơ nào nên được QA nghe trước. Người QA vào hồ sơ sẽ nghe âm thanh, đọc đoạn hội thoại và kiểm tra xem khách hàng đã được giải quyết yêu cầu hay chưa. Nếu còn việc tồn đọng, QA tạo vụ việc và giao người theo dõi, chứ AI không tự kết luận nhân viên sai. Với bản giữa kỳ, em đang dùng OneVoice để kiểm tra workflow và QA classifier thật theo transcript; phần SER fusion sẽ chỉ mở khi checkpoint đã được xác minh. Mục tiêu là giúp QA đi từ phát hiện đến quyết định và theo dõi xử lý trên cùng một hệ thống.”

## Phạm vi nghiệm thu hiện tại

- Giao diện, API/SQLite, hàng đợi, thao tác nghe và quy trình vụ việc đã có đường thực hiện và kiểm thử; cần xác nhận từng bước trên phiên FTISU cụ thể.
- XLM-R QA được fine-tune trên OneVoice tổng hợp; tự sàng lọc khi checkpoint nạp thành công. Kết quả là đề xuất, không phải ground truth.
- PhoWhisper ASR chỉ chạy trên audio khi checkpoint được chuẩn bị và adapter thật sẵn sàng. Với OneVoice nhập sẵn transcript, web dùng văn bản nguồn; không gọi đó là ASR inference.
- SER F4 (emotion2vec + PhoBERT + fusion) chưa verified serving trên FTISU; không trình bày như đã tạo ra emotion timeline.
- Chưa có đánh giá trên tập cuộc gọi CSKH thật với nhãn QA độc lập, nên không tuyên bố lợi ích kinh doanh hay chất lượng dự đoán ngoài miền.

**Giới hạn cốt lõi:** Một khách hàng nổi nóng vẫn có thể đã được hỗ trợ đúng; người nói bình tĩnh cũng có thể có yêu cầu nghiêm trọng. Vì thế điểm AI chỉ giúp sắp thứ tự nghe, còn QA chịu trách nhiệm xác minh và lưu quyết định.
