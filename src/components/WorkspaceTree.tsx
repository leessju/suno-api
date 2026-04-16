'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  midis?: WorkspaceMidi[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-background',
  converting: 'bg-amber-400',
  ready: 'bg-primary/60',
  generating: 'bg-purple-400',
  done: 'bg-green-400',
  error: 'bg-red-400',
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
  const router = useRouter()

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
      .then(data => setWorkspaces(data.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedAccount, selectedChannel])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])

  const toggleExpand = useCallback(async (wsId: string) => {
    const next = new Set(expanded)
    if (next.has(wsId)) {
      next.delete(wsId)
    } else {
      next.add(wsId)
      // lazy load midis
      const ws = workspaces.find(w => w.id === wsId)
      if (ws && !ws.midis) {
        setMidiLoading(prev => new Set([...prev, wsId]))
        try {
          const r = await fetch(`/api/music-gen/workspaces/${wsId}/midis`)
          const data = await r.json()
          setWorkspaces(prev => prev.map(w => w.id === wsId ? { ...w, midis: data.data ?? [] } : w))
        } catch (e) {
          console.error(e)
        } finally {
          setMidiLoading(prev => { const s = new Set(prev); s.delete(wsId); return s })
        }
      }
    }
    setExpanded(next)
    localStorage.setItem('expandedWorkspaces', JSON.stringify([...next]))
  }, [expanded, workspaces])

  const isWsActive = (id: string) => pathname.startsWith(`/workspaces/${id}`)
  const isMidiActive = (wsId: string, midiId: string) =>
    pathname.includes(`/workspaces/${wsId}/midis/${midiId}`)

  return (
    <div>
      {/* 새 워크스페이스 */}
      <Link
        href="/workspaces/new"
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground hover:bg-accent dark:hover:bg-accent transition-colors rounded-md mx-1"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        새 워크스페이스
      </Link>

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
            {/* 워크스페이스 행 */}
            <div className={`flex items-center gap-1 rounded-md transition-colors group ${isWsActive(ws.id) ? 'bg-accent' : 'hover:bg-accent dark:hover:bg-accent'}`}>
              <button
                onClick={() => toggleExpand(ws.id)}
                className="w-5 h-6 flex items-center justify-center flex-shrink-0 text-muted-foreground"
              >
                <svg className={`w-2.5 h-2.5 transition-transform ${expanded.has(ws.id) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 6 10">
                  <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
              <Link
                href={`/workspaces/${ws.id}`}
                className="flex-1 min-w-0 py-1.5 pr-2"
              >
                <span className={`text-xs truncate block leading-tight ${isWsActive(ws.id) ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {ws.name}
                </span>
              </Link>
              {ws.suno_sync_status === 'synced' && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 mr-2" title="Suno 싱크됨" />
              )}
              {ws.suno_sync_status === 'sync_failed' && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mr-2" title="싱크 실패" />
              )}
            </div>

            {/* MIDI 목록 (펼침) */}
            {expanded.has(ws.id) && (
              <div className="ml-5 pl-2 border-l border-border">
                {midiLoading.has(ws.id) && (
                  <div className="py-1 space-y-1">
                    <div className="h-5 bg-accent rounded animate-pulse" />
                  </div>
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
                    <span className="truncate flex-1">{midi.label ?? 'MIDI'}</span>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[midi.status] ?? 'bg-muted-foreground'}`} title={midi.status} />
                  </Link>
                ))}
                {!midiLoading.has(ws.id) && ws.midis?.length === 0 && (
                  <p className="py-1 px-2 text-[11px] text-muted-foreground">MIDI 없음</p>
                )}
                {/* MIDI 추가 */}
                <button
                  onClick={() => router.push(`/workspaces/${ws.id}?add_midi=1`)}
                  className="flex items-center gap-1 py-1 px-2 text-[11px] text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground transition-colors w-full"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  MIDI 추가
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
