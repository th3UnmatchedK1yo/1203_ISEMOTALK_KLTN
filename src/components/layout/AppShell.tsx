import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Headphones, BarChart3, Menu, X, ListChecks, UploadCloud, BookOpen, BriefcaseBusiness, ChevronDown, CircleCheck, AlertCircle } from 'lucide-react'
import { getSystemStatus } from '@/api/isemotalk'

interface AppShellProps { children: ReactNode }

const navItems = [
  { path: '/calls', label: 'Cuộc gọi', icon: ListChecks },
  { path: '/cases', label: 'Vụ việc', icon: BriefcaseBusiness },
  { path: '/analytics', label: 'Phân tích', icon: BarChart3 },
  { path: '/calls/new', label: 'Tải lên', icon: UploadCloud },
  { path: '/research', label: 'Nghiên cứu', icon: BookOpen },
]

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [serviceNotice, setServiceNotice] = useState<{title: string; detail: string; tone: 'ready' | 'warning' | 'error'} | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    getSystemStatus(controller.signal)
      .then(status => {
        if (controller.signal.aborted) return
        const qaReal = status.inference.reachable && status.inference.qa?.ready === true && status.inference.qa.loaded === true
        const qaAuto = status.automation?.qa === true
        const asrReal = status.inference.components?.asr?.ready === true &&
          status.inference.components.asr.mock === false
        const serUnavailable = status.inference.components?.ser?.adapter === 'not_configured'
        if (qaReal && serUnavailable) {
          setServiceNotice({
            title: qaAuto
              ? (asrReal && status.automation?.asr ? 'QA tự động và ASR đã sẵn sàng' : 'QA tự động đang hoạt động')
              : 'Model QA đã nạp · cần bật chế độ tự xử lý',
            detail: 'XLM-R gợi ý cuộc gọi cần xem từ transcript. ' +
              (asrReal && status.automation?.asr ? 'PhoWhisper có thể xử lý file âm thanh mới. ' : 'Các bản ghi nhập sẵn đang dùng transcript nguồn. ') +
              'SER F4 chưa được xác minh, vì vậy không có dự đoán cảm xúc. OneVoice là hội thoại TTS tổng hợp, không phải ghi âm tổng đài thật.',
            tone: qaAuto ? 'ready' : 'warning',
          })
        } else if (status.speechDemo) {
          setServiceNotice({ title: 'Đang sử dụng dữ liệu tiếng nói nguồn',
            detail: 'OneVoice là hội thoại TTS; DataHive/FOSD/FLEURS là mẫu thử tiếng nói, không chứng minh hiệu quả QA tổng đài. Chưa chạy model trên các bản ghi nguồn.', tone: 'warning' })
        } else if (status.demoData) {
          setServiceNotice({ title: 'Chế độ demo mô phỏng',
            detail: 'Dữ liệu, cảm xúc và âm thanh minh họa không phải kết quả mô hình thật. GPU inference đang tạm dừng.', tone: 'warning' })
        } else if (!status.inference.reachable) {
          setServiceNotice({ title: 'AI chưa kết nối',
            detail: 'API đã hoạt động, nhưng Python inference chưa sẵn sàng. Không đưa kết quả mô phỏng vào báo cáo nghiên cứu.', tone: 'error' })
        } else if (status.inference.components?.asr?.mock || status.inference.components?.ser?.mock) {
          setServiceNotice({ title: 'Đang dùng mô hình mô phỏng',
            detail: 'Mô hình ASR/SER đang dùng mock. Không sử dụng dự đoán này để đánh giá chất lượng hoặc làm số liệu nghiên cứu.', tone: 'warning' })
        } else setServiceNotice(null)
      })
      .catch(() => { if (!controller.signal.aborted) setServiceNotice({ title:'Không kết nối được máy chủ', detail:'Kiểm tra kết nối FTISU, SSH tunnel và API.', tone:'error' }) })
    return () => controller.abort()
  }, [])
  const active = (path: string) =>
    path === '/calls'
      ? location.pathname === '/calls' || location.pathname === '/'
      : path === '/cases' ? location.pathname.startsWith('/cases') : location.pathname === path

  const navLink = (path: string, label: string, Icon: typeof ListChecks, mobile: boolean) =>
    <Link
      key={path}
      to={path}
      aria-current={active(path) ? 'page' : undefined}
      onClick={() => { if (mobile) setMobileMenuOpen(false) }}
      className={
        'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ' +
        (active(path)
          ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-200'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950')
      }
    >
      <Icon aria-hidden="true" size={18} />
      {label}
    </Link>

  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1680px] items-center gap-4 px-5 md:px-8 xl:px-10">
        <Link to="/calls" className="flex shrink-0 items-center gap-3 rounded-lg" aria-label="ISEmoTalk — Trang cuộc gọi">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0E5665] text-white" aria-hidden="true">
            <Headphones size={21}/>
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold tracking-tight text-[#102D43]">ISEmoTalk</span>
            <span className="block text-xs font-medium tracking-wide text-slate-600">CALL QUALITY WORKSPACE</span>
          </span>
        </Link>
        <nav className="ml-3 hidden items-center gap-1 border-l border-slate-200 pl-3 lg:flex" aria-label="Điều hướng chính">
          {navItems.map(item => navLink(item.path, item.label, item.icon, false))}
        </nav>
        <div className="flex-1"/>
        <span className="hidden rounded-md border border-[#c6dfe2] bg-[#f0f8f8] px-3 py-1 text-sm font-semibold text-[#195f6a] xl:inline-flex">QA sau cuộc gọi</span>
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(v=>!v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 lg:hidden"
        >
          {mobileMenuOpen ? <X size={21}/> : <Menu size={21}/>}
        </button>
      </div>
      {mobileMenuOpen && <nav aria-label="Điều hướng di động" className="flex flex-col gap-1 border-t bg-white px-5 py-3 lg:hidden">
        {navItems.map(item => navLink(item.path, item.label, item.icon, true))}
      </nav>}
    </header>
    {serviceNotice && <div className="mx-auto max-w-[1680px] px-5 pt-4 md:px-8 xl:px-10">
      <details data-testid="gpu-preview-notice"
        className={'group rounded-xl border bg-white shadow-sm ' +
          (serviceNotice.tone === 'ready' ? 'border-teal-200' :
            serviceNotice.tone === 'error' ? 'border-rose-300' : 'border-amber-300')}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm marker:hidden">
          <span className="flex min-w-0 items-center gap-2.5 font-semibold text-slate-900">
            {serviceNotice.tone === 'ready'
              ? <CircleCheck size={18} className="shrink-0 text-teal-700" aria-hidden="true"/>
              : <AlertCircle size={18} className={'shrink-0 ' + (serviceNotice.tone === 'error' ? 'text-rose-700' : 'text-amber-700')} aria-hidden="true"/>}
            {serviceNotice.title}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-600">Chi tiết kỹ thuật <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true"/></span>
        </summary>
        <p className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">{serviceNotice.detail}</p>
      </details>
    </div>}
    <main className="mx-auto w-full max-w-[1680px] px-5 pb-12 pt-7 md:px-8 xl:px-10">
      {children}
    </main>
  </div>
}
