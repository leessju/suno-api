'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'

interface SunoCredits {
  credits_left: number
  monthly_usage: number
  monthly_limit: number
}

interface SunoAccount {
  id: number
  label: string
  is_active: boolean
  user_id: string | null
  credits?: SunoCredits
}

interface SunoAccountContextValue {
  accounts: SunoAccount[]
  selectedAccount: SunoAccount | null
  setSelectedAccount: (account: SunoAccount) => void
  isLoading: boolean
  refresh: () => void
  refreshCredits: (force?: boolean) => void
}

const SunoAccountContext = createContext<SunoAccountContextValue>({
  accounts: [],
  selectedAccount: null,
  setSelectedAccount: () => {},
  isLoading: true,
  refresh: () => {},
  refreshCredits: () => {},
})

export function useSunoAccount() {
  return useContext(SunoAccountContext)
}

export function SunoAccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<SunoAccount[]>([])
  const [selectedAccount, setSelectedAccountState] = useState<SunoAccount | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadAccounts = useCallback(() => {
    setIsLoading(true)
    fetch('/api/music-gen/suno-accounts')
      .then(r => r.json())
      .then(data => {
        const list: SunoAccount[] = Array.isArray(data) ? data : (data.data ?? [])
        setAccounts(list)
        const savedId = localStorage.getItem('selectedSunoAccountId')
        const saved = savedId ? list.find(a => a.id === Number(savedId)) : null
        const active = list.find(a => a.is_active)
        const selected = saved ?? active ?? list[0] ?? null
        setSelectedAccountState(selected)

        // 선택된 계정의 크레딧 자동 로드
        if (selected) {
          fetch(`/api/music-gen/suno-accounts/${selected.id}/credits`)
            .then(r => r.json())
            .then(c => {
              if (c.credits_left != null) {
                setSelectedAccountState(prev =>
                  prev?.id === selected.id ? { ...prev, credits: c } : prev
                )
              }
            })
            .catch(() => {})
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const selectedAccountRef = useRef(selectedAccount)
  useEffect(() => { selectedAccountRef.current = selectedAccount }, [selectedAccount])

  const lastCreditsFetchRef = useRef<number>(0)

  const refreshCredits = useCallback(async (force?: boolean) => {
    const acct = selectedAccountRef.current
    if (!acct) return
    // 5분(300초) TTL — force 파라미터로 강제 갱신 가능
    const now = Date.now()
    if (!force && now - lastCreditsFetchRef.current < 300_000) return
    lastCreditsFetchRef.current = now
    fetch(`/api/music-gen/suno-accounts/${acct.id}/credits`)
      .then(r => r.json())
      .then(c => {
        if (c.credits_left != null) {
          setSelectedAccountState(prev =>
            prev?.id === acct.id ? { ...prev, credits: c } : prev
          )
        }
      })
      .catch(() => {})
  }, [])

  const setSelectedAccount = useCallback((account: SunoAccount) => {
    setSelectedAccountState(account)
    localStorage.setItem('selectedSunoAccountId', String(account.id))

    // 계정 변경 시 크레딧 새로고침
    fetch(`/api/music-gen/suno-accounts/${account.id}/credits`)
      .then(r => r.json())
      .then(c => {
        if (c.credits_left != null) {
          setSelectedAccountState(prev =>
            prev?.id === account.id ? { ...prev, credits: c } : prev
          )
        }
      })
      .catch(() => {})
  }, [])

  return (
    <SunoAccountContext.Provider value={{
      accounts, selectedAccount, setSelectedAccount, isLoading, refresh: loadAccounts, refreshCredits
    }}>
      {children}
    </SunoAccountContext.Provider>
  )
}
