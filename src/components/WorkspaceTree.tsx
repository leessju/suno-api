'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSunoAccount } from './SunoAccountProvider'
import { useChannel } from './ChannelProvider'

interface WorkspaceMidi {
  id: string
  label: string | null
  status: string
  source_type: string
}

interface Workspace {
  id: string
  name: string
  suno_sync_status: string
  created_at: number
  midis?: WorkspaceMidi[]
}

const STATUS_COLORS: Record<string, string> = {
  pending:         'bg-background',
  converting:      'bg-amber-400',
  midi_generating: 'bg-orange-400',
  analyzing:       'bg-blue-400',
  ready:           'bg-primary/60',
  generating:      'bg-purple-400',
  done:            'bg-green-400',
  error:           'bg-red-400',
}

const SOURCE_ICONS: Record<string, string> = {
  youtube_video: '▶',
  mp3_file: '♪',
  direct_midi: '🎹',
}

export function WorkspaceTree() {
  const { selectedAccount } = useSunoAccount()
  const { selectedChannel } = useChannel()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('expandedWorkspaces')
      return new Set(saved ? JSON.parse(saved) : [])
    } catch { return new Set() }
  })
  const [loading, setLoading] = useState(false)
  const [midiLoading, setMidiLoading] = useState<Set<string>>(new Set())

  const loadWorkspaces = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedAccount) params.set('suno_account_id', String(selectedAccount.id))
    if (selectedChannel) params.set('channel_id', String(selectedChannel.id))

    fetch(`/api/music-gen/workspaces?${params}`)
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : (data.data ?? [])
        setWorkspaces(all.slice(0, 5))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedAccount, selectedChannel])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])

  // midi:deleted 이벤트 수신 시 트리에서 즉시 제거
  useEffect(() => {
    const handler = (e: Event) => {
      const { midiId, workspaceId } = (e as CustomEvent<{ midiId: string; workspaceId: string }>).detail
      setWorkspaces(prev => prev.map(w =>
        w.id === workspaceId
          ? { ...w, midis: w.midis?.filter(m => m.id !== midiId) }
          : w
      ))
    }
    window.addEventListener('midi:deleted', handler)
    return () => window.removeEventListener('midi:deleted', handler)
  }, [])

  const toggleExpand = useCallback(async (wsId: string) => {
    const next = new Set(expanded)
    const wasExpanded = next.has(wsId)
    if (wasExpanded) {
      next.delete(wsId)
    } else {
      next.add(wsId)
    }
    // 즉시 열기 — 링크가 바로 나타나야 클릭 가능
    setExpanded(next)
    localStorage.setItem('expandedWorkspaces', JSON.stringify([...next]))

    // lazy load midis (확장할 때만)
    if (!wasExpanded) {
      const ws = workspaces.find(w => w.id === wsId)
      if (ws && !ws.midis) {
        setMidiLoading(prev => new Set([...prev, wsId]))
        try {
          const r = await fetch(`/api/music-gen/workspaces/${wsId}/midis`)
          const data = await r.json()
          const midis = Array.isArray(data) ? data : (data.data ?? [])
          setWorkspaces(prev => prev.map(w => w.id === wsId ? { ...w, midis } : w))
        } catch (e) {
          console.error(e)
        } finally {
          setMidiLoading(prev => { const s = new Set(prev); s.delete(wsId); return s })
        }
      }
    }
  }, [expanded, workspaces])

  const isWsActive = (id: string) => pathname.startsWith(`/workspaces/${id}`)
  const isMidiActive = (wsId: string, midiId: string) =>
    pathname.includes(`/workspaces/${wsId}/midis/${midiId}`)
  const isWsRoot = (id: string) =>
    pathname === `/workspaces/${id}` && !searchParams.has('add_midi')
  const isAddMidi = (id: string) =>
    pathname === `/workspaces/${id}` && searchParams.get('add_midi') === '1'

  return (
    <div>
      {/* 헤더 링크 */}
      <div className="flex items-center justify-between mx-1 mb-0.5">
        <Link
          href="/workspaces"
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-md"
        >
          전체 보기
        </Link>
        <Link
          href="/workspaces/new"
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-md"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </Link>
      </div>

      {/* 워크스페이스 목록 */}
      <div className="space-y-0.5 px-1">
        {loading && (
          <div className="px-3 py-2 space-y-1.5">
            {[1,2].map(i => (
              <div key={i} className="h-6 bg-accent rounded animate-pulse" />
            ))}
          </div>
        )}
        {!loading && workspaces.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">워크스페이스 없음</p>
        )}
        {workspaces.map(ws => (
          <div key={ws.id}>
            {/* 워크스페이스 행 — 이름 클릭=상세, chevron 클릭=토글 */}
            <div className={`flex items-center px-3 py-2 text-sm transition-colors rounded-sm ${isWsActive(ws.id) ? 'bg-accent' : 'hover:bg-accent'}`}>
              <Link
                href={`/workspaces/${ws.id}`}
                className={`text-xs truncate flex-1 min-w-0 ${isWsActive(ws.id) ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {ws.name}
                {ws.midis !== undefined && (
                  <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">({ws.midis.length})</span>
                )}
              </Link>
              <button
                onClick={() => toggleExpand(ws.id)}
                className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className={`w-3.5 h-3.5 transition-transform duration-150 ${expanded.has(ws.id) ? 'rotate-90' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* 원곡 목록 (펼침) */}
            {expanded.has(ws.id) && (
              <div className="ml-5 pl-2 border-l border-border">
                {midiLoading.has(ws.id) && (
                  <div className="py-1 space-y-1">
                    <div className="h-5 bg-accent rounded animate-pulse" />
                  </div>
                )}
                {!midiLoading.has(ws.id) && ws.midis?.length === 0 && (
                  <p className="py-1 px-2 text-[10px] text-muted-foreground/50">원곡 없음</p>
                )}
                {!midiLoading.has(ws.id) && ws.midis?.map(midi => (
                  <Link
                    key={midi.id}
                    href={`/workspaces/${ws.id}/midis/${midi.id}`}
                    className={`flex items-center gap-1.5 py-1 px-2 rounded-md text-xs transition-colors ${
                      isMidiActive(ws.id, midi.id)
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent dark:hover:bg-accent'
                    }`}
                  >
                    <span className="text-[10px]">{SOURCE_ICONS[midi.source_type] ?? '♪'}</span>
                    <span className="truncate flex-1">{midi.label ?? '원곡'}</span>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[midi.status] ?? 'bg-muted-foreground'}`} title={midi.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
