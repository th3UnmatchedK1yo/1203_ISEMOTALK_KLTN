import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Headphones, BarChart3, Menu, X, ListChecks, UploadCloud } from 'lucide-react'

interface AppShellProps { children: ReactNode }

const navItems = [
  { path: '/calls', label: 'Cuộc gọi', icon: ListChecks },
  { path: '/analytics', label: 'Phân tích', icon: BarChart3 },
  { path: '/calls/new', label: 'Tải lên', icon: UploadCloud },
]

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const active = (path: string) =>
    path === '/calls'
      ? location.pathname === '/calls' || location.pathname === '/'
      : location.pathname === path

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
        <nav className="ml-5 hidden items-center gap-1 border-l border-slate-200 pl-5 md:flex" aria-label="Điều hướng chính">
          {navItems.map(item => navLink(item.path, item.label, item.icon, false))}
        </nav>
        <div className="flex-1"/>
        <span className="hidden rounded-full border border-[#c6dfe2] bg-[#f0f8f8] px-3 py-1 text-xs font-semibold text-[#195f6a] lg:inline-flex">Trình duyệt QA · Local</span>
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(v=>!v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 md:hidden"
        >
          {mobileMenuOpen ? <X size={21}/> : <Menu size={21}/>}
        </button>
      </div>
      {mobileMenuOpen && <nav aria-label="Điều hướng di động" className="flex flex-col gap-1 border-t bg-white px-5 py-3 md:hidden">
        {navItems.map(item => navLink(item.path, item.label, item.icon, true))}
      </nav>}
    </header>
    <main className="mx-auto w-full max-w-[1680px] px-5 pb-12 pt-7 md:px-8 xl:px-10">
      {children}
    </main>
  </div>
}
