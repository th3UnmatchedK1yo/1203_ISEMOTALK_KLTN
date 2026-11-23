import { Link } from 'react-router-dom'
import { ArrowRight, AudioLines, BarChart3, BookOpen, BriefcaseBusiness, CircleHelp, FileAudio, ListChecks, ScanSearch, UploadCloud } from 'lucide-react'

const steps = [
  {
    number: '01', title: 'Gửi ghi âm cho AI', href: '/scan', action: 'Mở Chạy AI',
    body: 'Chọn WAV/MP3/M4A. Máy chủ FTISU lưu file, chạy nhận dạng tiếng nói rồi tự gửi transcript sang mô hình sàng lọc.',
    note: 'Không cần gõ transcript hay tự điền nhận xét để AI bắt đầu.', icon: ScanSearch,
  },
  {
    number: '02', title: 'Mở cuộc gọi cần nghe', href: '/calls', action: 'Mở Cuộc gọi',
    body: 'Xem danh sách theo gợi ý AI, mở ghi âm, nhấn timestamp để nghe và kiểm tra nội dung do ASR tạo.',
    note: 'Điểm XLM-R chỉ là gợi ý sàng lọc, chưa phải điểm chất lượng.', icon: FileAudio,
  },
  {
    number: '03', title: 'QA đánh giá, rồi xử lý', href: '/cases', action: 'Xem Vụ việc',
    body: 'Người QA kết luận sau khi nghe. Nếu phải gọi lại, xử lý khiếu nại hay giao việc, tạo vụ việc có phụ trách và hạn.',
    note: 'Vụ việc không tự sinh chỉ vì điểm AI cao.', icon: BriefcaseBusiness,
  },
  {
    number: '04', title: 'Nhìn toàn bộ hàng đợi', href: '/analytics', action: 'Mở Tổng quan',
    body: 'Theo dõi bao nhiêu cuộc đã xử lý, bao nhiêu có gợi ý QA, còn tồn bao nhiêu và tình trạng cảm xúc khi model đã có.',
    note: 'Tổng quan đếm kết quả trên hồ sơ, không phải báo cáo độ chính xác AI.', icon: BarChart3,
  },
]

export function GuidePage() {
  return <article className="mx-auto max-w-5xl space-y-9 text-slate-800">
    <header className="max-w-3xl border-b border-slate-200 pb-7">
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800"><CircleHelp size={16}/> Hướng dẫn sử dụng</p>
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-[#12394d]">ISEmoTalk giúp ai, làm việc gì?</h1>
      <p className="mt-3 text-base leading-7 text-slate-700">
        Dành cho quản lý và nhân viên QA tổng đài. Mục đích là để AI đọc trước hàng loạt ghi âm,
        giúp người QA <strong>chọn đúng cuộc cần nghe</strong>, kiểm tra bằng chứng và theo dõi cách xử lý.
        Đây là hệ thống phân tích <strong>sau cuộc gọi</strong>, chưa kết nối tổng đài trực tiếp.
      </p>
      <Link to="/scan" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0E5665] px-5 py-3 text-sm font-bold text-white hover:bg-[#0B4554]">
        Bắt đầu bằng một file ghi âm <ArrowRight size={16}/>
      </Link>
    </header>

    <section aria-labelledby="how-it-works">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="how-it-works" className="text-xl font-bold text-[#12394d]">Quy trình dùng web</h2>
        <span className="text-xs text-slate-500">Gửi audio → AI → QA → báo cáo</span>
      </div>
      <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
        {steps.map(step => <div key={step.number} className="grid gap-3 py-5 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-start">
          <span className="text-xl font-semibold tabular-nums text-teal-800">{step.number}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><step.icon size={18} className="text-slate-600"/><h3 className="font-bold text-slate-900">{step.title}</h3></div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">{step.body}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{step.note}</p>
          </div>
          <Link to={step.href} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-teal-800 hover:underline">{step.action}<ArrowRight size={15}/></Link>
        </div>)}
      </div>
    </section>

    <section aria-labelledby="what-is-where">
      <h2 id="what-is-where" className="text-xl font-bold text-[#12394d]">Hai mục dễ nhầm</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <UploadCloud className="text-teal-800" size={22}/>
          <h3 className="mt-3 font-bold">Nhập dữ liệu nâng cao</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">Dành cho người có sẵn transcript theo mốc thời gian hoặc file JSON/CSV từ một pipeline khác. <strong>Không phải đường upload thông thường.</strong> Muốn AI nghe audio mới, chọn Chạy AI.</p>
          <Link to="/calls/new" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 hover:underline">Mở nhập nâng cao <ArrowRight size={15}/></Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <BookOpen className="text-teal-800" size={22}/>
          <h3 className="mt-3 font-bold">Mô hình và giới hạn</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">Tài liệu kỹ thuật: mỗi model làm gì, nguồn dữ liệu, kết quả nghiên cứu và những giới hạn chưa kiểm chứng. <strong>Không dùng để chạy AI hay xử lý cuộc gọi.</strong></p>
          <Link to="/research" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 hover:underline">Xem tài liệu kỹ thuật <ArrowRight size={15}/></Link>
        </div>
      </div>
    </section>

    <section aria-labelledby="ai-now" className="border-t border-slate-200 pt-6">
      <h2 id="ai-now" className="text-xl font-bold text-[#12394d]">AI nào đang làm được gì?</h2>
      <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm">
        {[
          {name: 'PhoWhisper · ASR',status:'Có code chạy thật',detail:'Đổi ghi âm thành chữ. Độ chính xác trên cuộc gọi phải đo bằng transcript chuẩn. Mono audio không tự phân biệt nhân viên và khách.'},
          {name:'XLM-R · Sàng lọc',status:'Có model thật, giới hạn dữ liệu',detail:'Phân loại văn bản tổng hợp OneVoice thành thông thường / cần chú ý. Đây không phải điểm chất lượng nhân viên.'},
          {name:'Diarization · Tách người nói',status:'Chưa triển khai hoàn chỉnh',detail:'Các đoạn audio mới hiện chưa được AI tự gán vai trò Agent/Customer. Không được xem các khung thời gian như lượt thoại.'},
          {name:'SER · Theo dõi cảm xúc',status:'Chưa có đầu ra F4 đã xác minh',detail:'Không hiển thị biểu đồ cảm xúc hoặc kết luận khách giận khi model chưa thật sự chạy.'},
          {name:'LLM · Tóm tắt nguyên nhân',status:'Chưa triển khai',detail:'Định hướng tiếp theo là tóm tắt có trích đoạn bằng chứng, không bịa đánh giá 10/10.'},
        ].map(item => <div key={item.name} className="grid gap-2 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <div><p className="font-semibold text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-600">{item.status}</p></div>
          <p className="leading-6 text-slate-700">{item.detail}</p>
        </div>)}
      </div>
    </section>

    <p className="border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
      Ghi nhớ: có file audio không có nghĩa đã nhận diện được cảm xúc; có điểm XLM-R không có nghĩa nhân viên làm sai.
      Hệ thống đang là bản nghiên cứu triển khai, các kết quả cần được kiểm chứng trước khi dùng để đánh giá con người.
    </p>
  </article>
}
