'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  leaving: boolean
}

interface ToastContextValue {
  toast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const toast = useCallback((message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, leaving: false }])
    // 2초 후 퇴장 시작
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t))
    }, 2000)
    // 퇴장 애니메이션 후 제거
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 2400)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium shadow-lg transition-all duration-300 ease-out ${
                t.leaving
                  ? 'opacity-0 -translate-y-2'
                  : 'opacity-100 translate-y-0 animate-in fade-in slide-in-from-top-3 duration-300'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
