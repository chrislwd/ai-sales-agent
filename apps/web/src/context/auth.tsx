'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api'

interface AuthUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

interface AuthWorkspace {
  id: string
  name: string
  slug: string
}

interface AuthContextValue {
  user: AuthUser | null
  workspace: AuthWorkspace | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [workspace, setWorkspace] = useState<AuthWorkspace | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) { setLoading(false); return }

    apiFetch<{ data: { user: AuthUser; memberships: { workspace: AuthWorkspace }[] } }>('/auth/me')
      .then(({ data }) => {
        setUser(data.user)
        setWorkspace(data.memberships[0]?.workspace ?? null)
      })
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await apiFetch<{
      data: { user: AuthUser; workspace: AuthWorkspace; tokens: { accessToken: string; refreshToken: string } }
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem('access_token', data.tokens.accessToken)
    localStorage.setItem('refresh_token', data.tokens.refreshToken)
    setUser(data.user)
    setWorkspace(data.workspace)
  }

  const logout = () => {
    const rt = localStorage.getItem('refresh_token')
    if (rt) apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: rt }) }).catch(() => {})
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
    setWorkspace(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, workspace, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
