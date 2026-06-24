import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Sym } from '@/components/shared/Sym'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-60 h-full">
            <Sidebar />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 text-white/70 hover:text-white z-10"
            >
              <Sym name="close" size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main content (transparent so the mesh-gradient body shows through) */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile top strip with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 glass-panel sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-white"
          >
            <Sym name="menu" size={22} />
          </button>
          <span className="text-white font-display font-semibold text-sm">TPS Operations</span>
        </div>

        <Outlet />
      </main>
    </div>
  )
}
