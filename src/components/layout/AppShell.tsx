import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Phone, BarChart3, Menu, X } from 'lucide-react'
import { useState } from 'react'

interface AppShellProps {
  children: ReactNode
}

const navItems = [
  { path: '/calls', label: 'Cuộc gọi', icon: Phone },
  { path: '/analytics', label: 'Phân tích', icon: BarChart3 },
]

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Phone className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="hidden font-semibold sm:inline-block">QA Call Center</span>
          </div>

          {/* Desktop Navigation */}
          <nav className="ml-6 hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path || 
                (item.path === '/calls' && location.pathname === '/')
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Mobile menu button */}
          <button
            className="md:hidden mr-2 p-2 rounded-md hover:bg-accent"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t p-4 bg-background">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path ||
                (item.path === '/calls' && location.pathname === '/')
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        {children}
      </main>
    </div>
  )
}
