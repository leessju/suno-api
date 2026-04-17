'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useChannel } from '@/components/ChannelProvider'
import { useSunoAccount } from '@/components/SunoAccountProvider'

interface Workspace {
  id: string
  name: string
  status: string
  suno_sync_status: string
  suno_workspace_id: string | null
  channel_name: string | null
  suno_account_label: string | null
  created_at: number
}


export default function WorkspacesPage() {
  const { selectedChannel } = useChannel()
  const { selectedAccount } = useSunoAccount()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 이름 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (selectedAccount) params.set('suno_account_id', String(selectedAccount.id))
    if (selectedChannel) params.set('channel_id', String(selectedChannel.id))

    fetch(`/api/music-gen/workspaces?${params}`)
      .then(r => r.json())
      .then(data => setWorkspaces(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => setError('목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [selectedAccount, selectedChannel])

  async function handleSaveName(id: string) {
    if (!editName.trim()) { setEditingId(null); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/music-gen/workspaces/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        const ws = data?.data ?? data
        setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name: ws.name ?? w.name, suno_sync_status: ws.suno_sync_status ?? w.suno_sync_status } : w))
      }
    } catch { /* ignore */ } finally {
      setSaving(false)
      setEditingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">워크스페이스</h1>
          {selectedAccount ? (
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/25 rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://suno.com/favicon.ico" alt="Suno" className="w-3.5 h-3.5 rounded-sm" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{selectedAccount.label}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">전체 워크스페이스</p>
          )}
        </div>
        <Link
          href="/workspaces/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          새 워크스페이스
        </Link>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-sm">{error}</div>
      )}

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-accent rounded-lg animate-pulse" />)}
        </div>
      )}

      {!loading && workspaces.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="w-12 h-12 text-muted-foreground/40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <p className="text-muted-foreground font-medium">워크스페이스가 없습니다</p>
          <p className="text-sm text-muted-foreground/70 mt-1">새 워크스페이스를 만들어 시작하세요.</p>
          <Link href="/workspaces/new"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            새 워크스페이스 만들기
          </Link>
        </div>
      )}

      {!loading && workspaces.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map(ws => (
            <div key={ws.id} className="relative group">
              {editingId === ws.id ? (
                /* 편집 모드 — 카드 클릭 비활성 */
                <div className="bg-background border border-ring rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveName(ws.id); if (e.key === 'Escape') setEditingId(null) }}
                      className="flex-1 text-sm font-medium bg-background border border-ring rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                    />
                    <button onClick={() => handleSaveName(ws.id)} disabled={saving}
                      className="text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                      {saving ? '...' : '저장'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground rounded border border-border">
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                /* 일반 모드 — 카드 전체 클릭 시 이동 */
                <Link href={`/workspaces/${ws.id}`}
                  className="block bg-background border border-border rounded-lg p-4 hover:border-ring/50 hover:shadow-sm transition-all">
                  <div className="mb-2">
                    <span className="font-medium text-foreground text-sm leading-snug truncate">
                      {ws.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60">
                    {new Date(ws.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </Link>
              )}

              {/* 편집 버튼 — hover 시 우상단 */}
              {editingId !== ws.id && (
                <button
                  onClick={e => { e.preventDefault(); setEditingId(ws.id); setEditName(ws.name) }}
                  className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1 rounded bg-background border border-border text-muted-foreground hover:text-foreground hover:border-ring transition-all z-10"
                  title="이름 변경"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
