'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/auth'
import clsx from 'clsx'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/dashboard/accounts', label: 'Accounts', icon: '🏢' },
  { href: '/dashboard/contacts', label: 'Contacts', icon: '👥' },
  { href: '/dashboard/sequences', label: 'Sequences', icon: '⚡' },
  { href: '/dashboard/templates', label: 'Templates', icon: '📄' },
  { href: '/dashboard/inbox', label: 'Inbox', icon: '📥' },
  { href: '/dashboard/meetings', label: 'Meetings', icon: '📅' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
]

export function Sidebar() {
  const path = usePathname()
  const { user, workspace, logout } = useAuth()

  return (
    <aside className="w-56 bg-brand-900 text-white flex flex-col h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-brand-700">
        <p className="font-bold text-sm truncate">{workspace?.name ?? '...'}</p>
        <p className="text-xs text-brand-100 truncate mt-0.5">{user?.email}</p>
      </div>

      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {NAV.map(({ href, label, icon }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                active
                  ? 'bg-brand-600 text-white'
                  : 'text-brand-100 hover:bg-brand-700 hover:text-white',
              )}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-brand-700">
        <button
          onClick={logout}
          className="text-sm text-brand-200 hover:text-white transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
