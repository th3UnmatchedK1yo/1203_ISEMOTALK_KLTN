import { Link } from 'react-router-dom'
import { ArrowRight, AudioLines, BookOpen, ClipboardCheck } from 'lucide-react'

const endpoints = [
  { rq: 'RQ1 · Tính bổ sung', model: 'F1 · XLS-R + XLM-R', question: 'Văn bản có bổ sung thông tin khi đánh giá trên người nói tách biệt?', decision: 'Giữ danh tính mô hình và từng nguồn bằng chứng. Chỉ so sánh âm thanh, văn bản và hợp nhất khi có đầu ra thật tương ứng.', limit: 'Điểm benchmark không phải độ chính xác trên cuộc gọi khách hàng.' },
  { rq: 'RQ2 · Sự phụ thuộc vào văn bản', model: 'B2 · emotion2vec + TF–IDF', question: 'Giữ nguyên audio và mô hình, đổi transcript thì dự đoán thay đổi thế nào?', decision: 'Cho nghe lại, sửa transcript và xem đầu vào gốc. Dự đoán cũ được đánh dấu khi văn bản đã sửa; lưu nhãn của QA riêng.', limit: 'Sửa transcript không tự chạy lại mô hình. Audio vẫn có nội dung ngôn ngữ; không phải một tín hiệu chỉ chứa ngữ điệu.' },
  { rq: 'RQ3 · Chuyển sang corpus khác', model: 'F4 · emotion2vec + PhoBERT', question: 'Dữ liệu bổ sung giúp đến đâu khi giữ cùng ngân sách huấn luyện tiếp?', decision: 'Theo dõi checkpoint, cấu hình và bộ kiểm chứng. Đánh giá dữ liệu cuộc gọi riêng trước khi mở rộng phạm vi sử dụng.', limit: 'F4 có đầu ra hợp nhất. Không tự tạo hai đầu ra âm thanh/văn bản từ checkpoint này.' },
]

export function ResearchPage() {
  return <article className="mx-auto max-w-6xl space-y-8 text-[#17364b]">
    <header className="border-b border-[#b7cbd5] pb-7">
      <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#0E5665]"><BookOpen size={18} aria-hidden="true"/> Nghiên cứu & phạm vi ứng dụng</p>
      <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-[#102D43]">Từ nhận diện cảm xúc đến bằng chứng để QA xem xét.</h1>
      <p className="mt-4 max-w-4xl text-lg leading-relaxed">ISEmoTalk hỗ trợ người kiểm soát chất lượng tìm đoạn cần nghe lại trong cuộc gọi tiếng Việt, kiểm tra dự đoán và ghi nhận việc cần xử lý tiếp.</p>
      <Link to="/calls" className="mt-5 inline-flex items-center gap-2 font-semibold text-[#0E5665] underline underline-offset-4">Mở hàng đợi xem xét <ArrowRight size={18} aria-hidden="true"/></Link>
    </header>

    <section aria-labelledby="process-heading">
      <h2 id="process-heading" className="text-xl font-semibold text-[#102D43]">Một cuộc gọi đi qua hệ thống như thế nào?</h2>
      <ol className="mt-4 grid gap-0 overflow-hidden rounded-lg border border-[#b7cbd5] bg-white md:grid-cols-3">
        {[
          { icon: AudioLines, title: '01 · Tiếp nhận & phân tích', body: 'Nhập ghi âm hoặc kết quả có nguồn gốc. ASR tạo văn bản; gán vai người nói; SER trả dự đoán theo từng đoạn. Job lưu tiến độ và lỗi để thử lại.' },
          { icon: ClipboardCheck, title: '02 · Người đánh giá kiểm tra', body: 'Nghe audio tại timestamp, đọc transcript, so sánh bằng chứng đang có. Xác nhận hoặc sửa nhãn, ghi chú và lưu đánh giá.' },
          { icon: ArrowRight, title: '03 · Chốt hành động nghiệp vụ', body: 'Liên kết mã ticket, ghi kết quả xử lý, người phụ trách và hạn gọi lại. Lưu lịch sử thay đổi; trạng thái xử lý vụ việc tách khỏi trạng thái AI và QA.' },
        ].map(({ icon: Icon, title, body }) => <li key={title} className="border-b border-[#d4e0e6] p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
          <Icon size={22} className="mb-4 text-[#0E5665]" aria-hidden="true"/>
          <h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-700">{body}</p>
        </li>)}
      </ol>
      <p className="mt-3 text-sm text-slate-700">Đây là quy trình QA sau cuộc gọi. Mã liên hệ và ticket hiện do người dùng nhập; ứng dụng chưa nối trực tiếp tổng đài hoặc CRM.</p>
    </section>

    <section aria-labelledby="paper-heading">
      <h2 id="paper-heading" className="text-xl font-semibold text-[#102D43]">Paper dẫn đến những quyết định thiết kế nào?</h2>
      <p className="mt-2 leading-relaxed">Tài liệu đối chiếu: <cite>Acoustic–Lexical Reliance in Vietnamese Speech Emotion Recognition Across Speaker and Corpus Shifts</cite>, bản v10.1 được cung cấp. Ba câu hỏi dưới đây dùng ba họ mô hình riêng.</p>
      <div className="mt-5 divide-y divide-[#c5d6df] border-y border-[#b7cbd5]">
        {endpoints.map(e => <section key={e.rq} className="grid gap-4 py-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <div><h3 className="font-semibold text-[#0E5665]">{e.rq}</h3><p className="mt-2 text-sm text-slate-700">{e.model}</p></div>
          <div className="space-y-3"><p className="font-medium">{e.question}</p><p>{e.decision}</p><p className="border-l-2 border-amber-600 pl-3 text-sm text-slate-700">Giới hạn: {e.limit}</p></div>
        </section>)}
      </div>
    </section>

    <section className="grid gap-6 md:grid-cols-2" aria-label="Cách đọc kết quả">
      <div className="rounded-lg border border-[#b7cbd5] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#102D43]">Đọc đúng kết quả trên màn hình</h2>
        <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-relaxed">
          <li>Phần trăm cạnh nhãn là điểm do mô hình trả về; chưa phải xác suất đúng đã được hiệu chuẩn.</li>
          <li>Khoảnh khắc và mức ưu tiên là gợi ý theo quy tắc để chọn đoạn nghe lại. Một nhãn “buồn” không chứng minh nhân viên làm sai.</li>
          <li>Chỉ tổng hợp cảm xúc khách hàng khi vai người nói đã được gán. Thiếu dữ liệu phải hiển thị là chưa xác định.</li>
          <li>Kết quả nhập, kết quả mô phỏng và kết quả suy luận được nhận diện riêng. Kiểm chứng checkpoint không thay thế đánh giá trên miền cuộc gọi.</li>
        </ul>
      </div>
      <div className="rounded-lg border border-[#b7cbd5] bg-[#eef6f5] p-5">
        <h2 className="text-lg font-semibold text-[#102D43]">Điều cần chứng minh trước triển khai</h2>
        <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-relaxed">
          <li>Khôi phục đúng model, tiền xử lý và weights; so sánh đầu ra phục vụ với đầu ra tham chiếu trên cùng mẫu.</li>
          <li>Đo WER/CER cho ASR, macro-F1/UAR cho SER bằng dữ liệu có nhãn; báo riêng từng nguồn và từng miền dữ liệu.</li>
          <li>Đo thời gian cold/warm, RAM/VRAM và lỗi với ghi âm thực trên máy trình bày.</li>
          <li>Đánh giá QA có tìm đúng đoạn nhanh hơn không. CSAT cần khảo sát; FCR cần lịch sử các lần liên hệ cùng vấn đề.</li>
        </ul>
      </div>
    </section>

    <footer className="border-t border-[#b7cbd5] pt-4 text-sm leading-relaxed text-slate-700">
      <p>ASR demo faster-whisper-small và ASR PhoWhisper của nghiên cứu là các cấu hình khác nhau. Trạng thái mô hình thực tế nằm trong màn hình tải lên và bằng chứng xử lý của từng cuộc gọi.</p>
    </footer>
  </article>
}
