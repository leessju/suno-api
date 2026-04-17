'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface SideNavContextValue {
  collapsed: boolean
  toggleCollapsed: () => void
  mobileOpen: boolean
  toggleMobile: () => void
  closeMobile: () => void
}

const SideNavContext = createContext<SideNavContextValue | null>(null)

export function SideNavProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggleCollapsed() {
    setCollapsed(prev => !prev)
  }

  function toggleMobile() {
    setMobileOpen(prev => !prev)
  }

  function closeMobile() {
    setMobileOpen(false)
  }

  return (
    <SideNavContext.Provider value={{ collapsed, toggleCollapsed, mobileOpen, toggleMobile, closeMobile }}>
      {children}
    </SideNavContext.Provider>
  )
}

export function useSideNav() {
  const ctx = useContext(SideNavContext)
  if (!ctx) throw new Error('useSideNav must be used within SideNavProvider')
  return ctx
}
