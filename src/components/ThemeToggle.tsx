'use client'

import { useState, useEffect } from 'react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('theme') ?? 'dark'
    setIsDark(saved !== 'light')
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
  }

  if (!mounted) return <div className="w-8 h-8" />

  return (
    <button
      onClick={toggle}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground dark:hover:text-primary-foreground hover:bg-accent dark:hover:bg-accent transition-colors text-base"
    >
      {isDark ? '☀' : '☾'}
    </button>
  )
}
