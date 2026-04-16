'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { extractYoutubeVideoId, getMidiThumbnail } from '@/lib/youtube-utils'
import { extractMp3Cover } from '@/lib/mp3-cover'

interface Midi {
  id: string
  workspace_id: string
  workspace_name: string
  source_type: string
  source_ref: string | null
  label: string | null
  status: string
  created_at: number
}

interface Workspace {
  id: string
  name: string
}

function AddMidiModal({
  workspaces,
  onClose,
  onSuccess,
}: {
  workspaces: Workspace[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? '')
  const [sourceType, setSourceType] = useState<'youtube_video' | 'mp3_file'>('youtube_video')
  const [sourceRef, setSourceRef] = useState('')
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [ytStatus, setYtStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [ytTitle, setYtTitle] = useState<string | null>(null)
  const [mp3Cover, setMp3Cover] = useState<string | null>(null)
  const ytTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (mp3Cover) URL.revokeObjectURL(mp3Cover) }
  }, [mp3Cover])

  useEffect(() => {
    if (ytTitle && !label.trim()) setLabel(ytTitle)
  }, [ytTitle])

  function handleYoutubeUrlChange(url: string) {
    setSourceRef(url)
    setYtTitle(null)
    if (ytTimerRef.current) clearTimeout(ytTimerRef.current)
    if (!url.trim()) { setYtStatus('idle'); return }
    const videoId = extractYoutubeVideoId(url)
    if (!videoId) { setYtStatus('invalid'); return }
    setYtStatus('checking')
    ytTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          const data = await res.json()
          setYtStatus('valid')
          setYtTitle(data.title ?? null)
        } else {
          setYtStatus('invalid')
        }
      } catch {
        setYtStatus('invalid')
      }
    }, 600)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!workspaceId) { setError('워크스페이스를 선택하세요'); return }
    if (!sourceRef.trim()) { setError('소스를 입력하세요'); return }
    if (sourceType === 'youtube_video' && ytStatus !== 'valid') { setError('유효한 YouTube URL을 입력하세요'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/music-gen/workspaces/${workspaceId}/midis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: sourceType, source_ref: sourceRef, label: label || undefined, gen_mode: 'auto', original_ratio: 50 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '오류가 발생했습니다')
      const saved = data?.data ?? data
      fetch(`/api/music-gen/workspaces/${workspaceId}/midis/${saved.id}/analyze`, { method: 'POST' }).catch(() => {})
      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  const thumb = ytStatus === 'valid' ? getMidiThumbnail('youtube_video', sourceRef) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col" style={{ height: '600px' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">새 MIDI 추가</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* 워크스페이스 선택 */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">워크스페이스</label>
            <select
              value={workspaceId}
              onChange={e => setWorkspaceId(e.target.value)}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>

          {/* 소스 타입 */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-2">소스 타입</label>
            <div className="flex gap-6">
              {([
                { value: 'youtube_video', label: 'YouTube' },
                { value: 'mp3_file', label: 'MP3 파일' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="source_type"
                    value={opt.value}
                    checked={sourceType === opt.value}
                    onChange={() => { setSourceType(opt.value); setSourceRef(''); setLabel(''); setYtStatus('idle'); setYtTitle(null); if (mp3Cover) { URL.revokeObjectURL(mp3Cover); setMp3Cover(null) } }}
                    className="accent-primary w-3.5 h-3.5"
                  />
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* URL / 파일 */}
          <div>
            {sourceType === 'youtube_video' ? (
              <>
                <label className="block text-xs font-medium text-foreground mb-1">YouTube URL</label>
                <input
                  type="text"
                  value={sourceRef}
                  onChange={e => handleYoutubeUrlChange(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className={`w-full px-3 py-2 text-sm bg-background border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 ${
                    ytStatus === 'valid' ? 'border-green-400 focus:ring-green-400/50'
                    : ytStatus === 'invalid' ? 'border-red-400 focus:ring-red-400/50'
                    : 'border-input focus:ring-ring'
                  }`}
                />
                {ytStatus === 'checking' && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    영상 확인 중...
                  </p>
                )}
                {ytStatus === 'valid' && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    <span className="text-xs text-green-600 dark:text-green-400">유효함</span>
                  </div>
                )}
                {ytStatus === 'valid' && thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="mt-2 w-40 aspect-video object-cover rounded-md border border-border" />
                )}
                {ytStatus === 'invalid' && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-red-500">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    유효하지 않은 URL
                  </p>
                )}
              </>
            ) : (
              <>
                <label className="block text-xs font-medium text-foreground mb-1">MP3 파일</label>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,.mp3"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setSourceRef(file.name)
                    setLabel(prev => prev || file.name.replace(/\.[^.]+$/, ''))
                    if (mp3Cover) URL.revokeObjectURL(mp3Cover)
                    const cover = await extractMp3Cover(file)
                    setMp3Cover(cover)
                  }}
                  className="w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-accent file:text-foreground hover:file:bg-accent/80 cursor-pointer"
                />
                {mp3Cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mp3Cover} alt="" className="mt-2 w-40 h-40 object-cover rounded-md border border-border" />
                )}
              </>
            )}
          </div>

          {/* 라벨 */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">라벨 (선택)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="예: 기억의 빈자리 커버"
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-accent hover:bg-accent/80 text-foreground text-sm rounded-lg transition-colors">
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !sourceRef.trim() || (sourceType === 'youtube_video' && ytStatus !== 'valid') || ytStatus === 'checking'}
              className="px-4 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-sm rounded-lg transition-opacity"
            >
              {submitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function WorkspaceCombobox({
  workspaces,
  value,
  onChange,
}: {
  workspaces: Workspace[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = workspaces.find(ws => ws.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-input rounded-md px-2.5 py-1.5 text-sm bg-background text-foreground hover:border-ring/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors min-w-[140px] max-w-[220px]"
      >
        <span className="truncate flex-1 text-left">{selected ? selected.name : '전체'}</span>
        <svg className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[180px] max-h-72 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${!value ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
          >
            <span className="flex-1 text-left">전체</span>
            {!value && <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </button>
          {workspaces.map(ws => {
            const isSelected = ws.id === value
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => { onChange(ws.id); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
              >
                <span className="flex-1 text-left truncate">{ws.name}</span>
                {isSelected && <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MidisPage() {
  const [midis, setMidis] = useState<Midi[]>([])
  const [loading, setLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [filterWorkspaceId, setFilterWorkspaceId] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch('/api/music-gen/workspaces')
      .then(r => r.json())
      .then(d => setWorkspaces(Array.isArray(d) ? d : (d.data ?? [])))
  }, [])

  function loadMidis(workspaceId?: string) {
    setLoading(true)
    const params = new URLSearchParams()
    if (workspaceId) params.set('workspace_id', workspaceId)
    fetch(`/api/music-gen/midis?${params}`)
      .then(r => r.json())
      .then(d => setMidis(Array.isArray(d) ? d : (d.data ?? [])))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadMidis(filterWorkspaceId || undefined) }, [filterWorkspaceId])

  const statusColor: Record<string, string> = {
    pending:         'text-muted-foreground bg-accent',
    converting:      'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
    midi_generating: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
    analyzing:       'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    ready:           'text-green-600 bg-green-50 dark:bg-green-900/20',
    generating:      'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
    done:            'text-foreground bg-accent',
    error:           'text-red-600 bg-red-50 dark:bg-red-900/20',
  }

  const statusLabel: Record<string, string> = {
    pending:         '대기',
    converting:      'MP3 변환 중',
    midi_generating: 'MIDI 생성 중',
    analyzing:       '분석 중',
    ready:           '완료',
    generating:      '생성 중',
    done:            '완료',
    error:           '오류',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">미디파일</h1>
          <p className="text-sm text-muted-foreground mt-1">전체 워크스페이스의 MIDI 파일 목록</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 transition-opacity"
        >
          MIDI 추가
        </button>
      </div>

      {showAdd && workspaces.length > 0 && (
        <AddMidiModal
          workspaces={workspaces}
          onClose={() => setShowAdd(false)}
          onSuccess={() => loadMidis(filterWorkspaceId || undefined)}
        />
      )}

      {/* 워크스페이스 필터 */}
      {workspaces.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground flex-shrink-0">워크스페이스</label>
          <WorkspaceCombobox
            workspaces={workspaces}
            value={filterWorkspaceId}
            onChange={setFilterWorkspaceId}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-accent rounded-lg animate-pulse" />)}
        </div>
      ) : midis.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">미디 파일이 없습니다.</div>
      ) : (
        <div className="space-y-1.5">
          {midis.map(m => (
            <Link
              key={m.id}
              href={`/workspaces/${m.workspace_id}/midis/${m.id}`}
              className="flex items-center gap-4 bg-background border border-border rounded-lg px-4 py-3 hover:border-foreground/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {m.label ?? m.source_ref ?? m.id}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.workspace_name} · {m.source_type}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[m.status] ?? statusColor.pending}`}>
                {statusLabel[m.status] ?? m.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
