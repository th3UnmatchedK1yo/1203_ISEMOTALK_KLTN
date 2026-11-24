import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { AudioLines, LayoutDashboard, UploadCloud, ListChecks, BarChart3 } from 'lucide-react'

const links = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/import', label: 'Thêm bản ghi', icon: UploadCloud },
  { path: '/calls', label: 'Hàng đợi QA', icon: ListChecks },
  { path: '/analytics', label: 'Báo cáo', icon: BarChart3 },
]
export function AppShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#f7f5f1] text-stone-900 md:grid md:grid-cols-[224px_minmax(0,1fr)]">
    <aside className="border-b border-stone-200 bg-white md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="rounded-xl bg-[#76543c] p-2.5 text-white"><AudioLines size={22} /></div>
        <div><div className="font-bold tracking-tight text-lg">ISEmoTalk</div><div className="text-xs text-stone-500">SER · Conversation review</div></div>
      </div>
      <nav aria-label="Điều hướng" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
        {links.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'} className={({isActive}) => 'flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ' + (isActive ? 'bg-[#efe6db] text-[#69492f]' : 'text-stone-600 hover:bg-stone-100')}><Icon size={18}/>{label}</NavLink>)}
      </nav>
      <p className="hidden px-6 pt-10 text-xs leading-relaxed text-stone-500 md:block">AI gợi ý đoạn cần nghe lại. Người kiểm tra đưa ra kết luận cuối cùng.</p>
    </aside>
    <main className="mx-auto w-full min-w-0 max-w-[1520px] p-4 md:p-8">{children}</main>
  </div>
}
