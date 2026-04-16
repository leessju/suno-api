'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChannel } from '@/components/ChannelProvider'
import { useSunoAccount } from '@/components/SunoAccountProvider'

export default function NewWorkspacePage() {
  const router = useRouter()
  const { selectedChannel } = useChannel()
  const { selectedAccount } = useSunoAccount()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('워크스페이스 이름을 입력하세요'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/music-gen/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          channel_id: selectedChannel?.id,
          suno_account_id: selectedAccount?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? 'Failed to create workspace')
      router.push(`/workspaces/${data.data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">새 워크스페이스</h1>
        <p className="text-sm text-muted-foreground mt-1">
          이름을 입력하면 워크스페이스가 생성됩니다.
          {selectedAccount && (
            <span className="ml-1">Suno 계정: <strong className="text-foreground">{selectedAccount.label}</strong></span>
          )}
        </p>
      </div>

      <div className="bg-background border border-border rounded-lg shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-sm">
              {error}
            </div>
          )}

          {!selectedAccount && (
            <div className="p-3 bg-accent border border-border rounded-md text-muted-foreground text-sm">
              ⚠ Suno 계정이 선택되지 않았습니다. 상단 헤더에서 계정을 선택하거나 추가하세요.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">워크스페이스 이름</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: J-Pop Vol.5"
              autoFocus
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-2.5 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-medium rounded-md transition-opacity text-sm"
          >
            {loading ? '생성 중...' : '워크스페이스 만들기'}
          </button>
        </form>
      </div>
    </div>
  )
}
