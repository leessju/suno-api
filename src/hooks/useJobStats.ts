'use client'

import { useState, useEffect } from 'react'

export interface JobStats {
  pending: number
  running: number
  done: number
  failed: number
}

export function useJobStats() {
  const [stats, setStats] = useState<JobStats>({ pending: 0, running: 0, done: 0, failed: 0 })

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/music-gen/queue')
        if (!res.ok || cancelled) return
        const json = await res.json()
        const s = json?.stats ?? json?.data ?? json
        if (!cancelled) {
          setStats({
            pending: s?.pending ?? 0,
            running: s?.running ?? 0,
            done: s?.done ?? 0,
            failed: s?.failed ?? 0,
          })
        }
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return stats
}
