import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../stores/authStore'
import { ProfileMenu } from '../components/ProfileMenu'
import { LayoutGrid, Building2, Users, Copy, UtensilsCrossed } from 'lucide-react'

const ROLE_LABELS = {
  level1: 'Developer',
  level2: 'Group Manager',
  level3: 'Brand Manager',
  staff: 'Staff',
}

export default function AdminLayout() {
  const { user } = useAuth()

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
    ...(user.role === 'level1' ? [{ to: '/admin/groups', label: 'Groups', icon: Building2 }] : []),
    { to: '/admin/brands', label: 'Brands', icon: UtensilsCrossed },
    { to: '/admin/users', label: 'Users', icon: Users },
    ...(user.role === 'level1' || user.role === 'level2' ? [{ to: '/admin/clone', label: 'Clone Menu', icon: Copy }] : []),
  ]

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="flex w-60 flex-shrink-0 flex-col bg-ink text-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-marigold text-ink">
            <UtensilsCrossed size={16} />
          </div>
          <span className="font-display text-lg">Menu System</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
