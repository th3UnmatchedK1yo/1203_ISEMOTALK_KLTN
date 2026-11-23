import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Headphones, BarChart3, Menu, X, ListChecks, UploadCloud, BookOpen, BriefcaseBusiness } from 'lucide-react'
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
  const [serviceNotice, setServiceNotice] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    getSystemStatus(controller.signal)
      .then(status => {
        if (controller.signal.aborted) return
        if (!status.inference.reachable) {
          setServiceNotice('Chế độ giao diện/QA: API đã kết nối, nhưng dịch vụ AI chưa hoạt động. Không gửi audio để phân tích cho đến khi model chạy thật trên GPU.')
        } else if (status.inference.components?.asr?.mock || status.inference.components?.ser?.mock) {
          setServiceNotice('Dịch vụ đang dùng mô hình mô phỏng. Không sử dụng kết quả này làm số liệu nghiên cứu.')
        } else setServiceNotice(null)
      })
      .catch(() => { if (!controller.signal.aborted) setServiceNotice('Không kết nối được API của hệ thống. Kiểm tra VS Code Port Forwarding và server FTISU.') })
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
    {serviceNotice && <div role="status" className="mx-auto mt-4 max-w-[1680px] rounded-lg border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-950 md:mx-8" data-testid="gpu-preview-notice">
      {serviceNotice}
    </div>}
    <main className="mx-auto w-full max-w-[1680px] px-5 pb-12 pt-7 md:px-8 xl:px-10">
      {children}
    </main>
  </div>
}
