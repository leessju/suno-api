'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChannel } from '@/components/ChannelProvider'
import { useSunoAccount } from '@/components/SunoAccountProvider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

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
      const wsId = data?.id ?? data?.data?.id
      router.push(`/workspaces/${wsId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">새 워크스페이스</h1>
        <p className="text-sm text-muted-foreground mt-1">
          이름을 입력하면 워크스페이스가 생성됩니다.
        </p>
        {selectedAccount && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/25 rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://suno.com/favicon.ico" alt="Suno" className="w-3.5 h-3.5 rounded-sm" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{selectedAccount.label}</span>
          </div>
        )}
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
            <Label className="block text-sm font-medium text-foreground mb-1.5">워크스페이스 이름</Label>
            <Input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: J-Pop Vol.5"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full"
          >
            {loading ? '생성 중...' : '워크스페이스 만들기'}
          </Button>
        </form>
      </div>
    </div>
  )
}
