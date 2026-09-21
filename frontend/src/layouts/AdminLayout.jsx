import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../stores/authStore'
import { ProfileMenu } from '../components/ProfileMenu'
import { LayoutGrid, Building2, Users, Copy, UtensilsCrossed, BarChart3, Menu, X } from 'lucide-react'

const ROLE_LABELS = {
  level1: 'Developer',
  level2: 'Group Manager',
  level3: 'Brand Manager',
  staff: 'Staff',
}

export default function AdminLayout() {
  const { user } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
    ...(user.role === 'level1' ? [{ to: '/admin/groups', label: 'Groups', icon: Building2 }] : []),
    { to: '/admin/brands', label: 'Brands', icon: UtensilsCrossed },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { to: '/admin/users', label: 'Users', icon: Users },
    ...(user.role === 'level1' || user.role === 'level2' ? [{ to: '/admin/clone', label: 'Clone Menu', icon: Copy }] : []),
  ]

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Mobile/tablet top bar — the fixed sidebar only shows at md+, this
          stands in for it below that so content never gets squeezed. */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-sand bg-ink px-4 py-3 text-white md:hidden">
        <button
          onClick={() => setNavOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-marigold text-ink">
            <UtensilsCrossed size={14} />
          </div>
          <span className="font-display text-base">Menu System</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Backdrop behind the mobile drawer */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-shrink-0 flex-col bg-ink text-white transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-marigold text-ink">
              <UtensilsCrossed size={16} />
            </div>
            <span className="font-display text-lg">Menu System</span>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <p className="mb-2 px-1 text-xs text-white/50">{ROLE_LABELS[user.role]}</p>
          <ProfileMenu theme="dark" />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
