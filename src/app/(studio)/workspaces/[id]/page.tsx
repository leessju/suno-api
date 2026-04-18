'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getMidiThumbnail, extractYoutubeVideoId } from '@/lib/youtube-utils'
import { extractMp3Cover } from '@/lib/mp3-cover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WorkspaceMidi {
  id: string
  label: string | null
  source_type: string
  source_ref: string | null
  cover_image?: string | null
  gen_mode: string
  original_ratio: number
  status: string
  error_message: string | null
  cover_count: number
  created_at: number
}

interface Workspace {
  id: string
  name: string
  pipeline_mode: string
  status: string
  suno_sync_status: string
  suno_workspace_id: string | null
  suno_project_id: string | null
  channel_name: string | null
  channel_id: string | null
  suno_account_label: string | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:         { label: '대기',         color: 'bg-accent text-muted-foreground' },
  converting:      { label: 'MP3 변환 중',  color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  midi_generating: { label: 'MIDI 생성 중', color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
  analyzing:       { label: '분석 중',      color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  ready:           { label: '완료',          color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
  generating:      { label: '생성 중',      color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
  done:            { label: '완료',         color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
  error:           { label: '오류',         color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  youtube_video: 'YouTube',
  mp3_file: 'MP3',
  direct_midi: 'MIDI',
}

export default function WorkspaceHubPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [midis, setMidis] = useState<WorkspaceMidi[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMidi, setShowAddMidi] = useState(() => searchParams.get('add_midi') === '1')

  // URL 파라미터가 바뀔 때 (사이드바 링크 클릭 등) 폼 표시 상태 동기화
  useEffect(() => {
    setShowAddMidi(searchParams.get('add_midi') === '1')
  }, [searchParams])

  // 이름 편집 상태
  const [editingName, setEditingName] = useState(false)
  const [editNameVal, setEditNameVal] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Suno Project ID 편집 상태
  const [sunoProjectIdVal, setSunoProjectIdVal] = useState('')
  const [savingSunoProjectId, setSavingSunoProjectId] = useState(false)

  // 채널 썸네일
  const [channelThumb, setChannelThumb] = useState<string | null>(null)

  // 원곡 추가 폼 상태
  const [sourceType, setSourceType] = useState<'youtube_video' | 'mp3_file'>('youtube_video')
  const [sourceRef, setSourceRef] = useState('')
  const [label, setLabel] = useState('')
  const [addingMidi, setAddingMidi] = useState(false)
  const [addError, setAddError] = useState('')

  // YouTube URL 실시간 검증
  const [ytStatus, setYtStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [ytTitle, setYtTitle] = useState<string | null>(null)
  const ytDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // MP3 커버 이미지 (Object URL)
  const [mp3Cover, setMp3Cover] = useState<string | null>(null)
  const [mp3File, setMp3File] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PROCESSING_STATUSES = ['pending', 'converting', 'midi_generating', 'analyzing', 'generating']

  const loadData = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true)
    try {
      const wsRes = await fetch(`/api/music-gen/workspaces/${id}`)
      const wsData = await wsRes.json()
      const ws = wsData?.data ?? wsData
      setWorkspace(ws)
      const midiList: WorkspaceMidi[] = Array.isArray(ws?.midis) ? ws.midis : []
      setMidis(midiList)

      // 처리 중인 MIDI가 있으면 5초 후 자동 갱신
      if (midiList.some(m => PROCESSING_STATUSES.includes(m.status))) {
        pollRef.current = setTimeout(() => loadData(true), 5000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (!isPolling) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [loadData])

  useEffect(() => {
    if (workspace) setSunoProjectIdVal(workspace.suno_project_id ?? '')
  }, [workspace?.suno_project_id])

  // 채널 썸네일 fetch
  useEffect(() => {
    if (workspace?.channel_id) {
      fetch(`/api/music-gen/channels/${workspace.channel_id}/youtube-info`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const ch = data?.data ?? data
          if (ch?.thumbnail) setChannelThumb(ch.thumbnail)
        })
        .catch(() => {})
    }
  }, [workspace?.channel_id])

  useEffect(() => {
    if (ytTitle && !label.trim()) setLabel(ytTitle)
  }, [ytTitle])

  function handleYoutubeUrlChange(url: string) {
    setSourceRef(url)
    setYtTitle(null)
    if (ytDebounceRef.current) clearTimeout(ytDebounceRef.current)
    if (!url.trim()) { setYtStatus('idle'); return }
    const videoId = extractYoutubeVideoId(url)
    if (!videoId) { setYtStatus('invalid'); return }
    setYtStatus('checking')
    ytDebounceRef.current = setTimeout(async () => {
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

  async function handleSaveName() {
    if (!editNameVal.trim() || editNameVal === workspace?.name) { setEditingName(false); return }
    setSavingName(true)
    try {
      const res = await fetch(`/api/music-gen/workspaces/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editNameVal.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        const ws = data?.data ?? data
        setWorkspace(prev => prev ? { ...prev, name: ws.name ?? prev.name, suno_sync_status: ws.suno_sync_status ?? prev.suno_sync_status } : prev)
      }
    } finally {
      setSavingName(false)
      setEditingName(false)
    }
  }

  async function handleSaveSunoProjectId() {
    setSavingSunoProjectId(true)
    try {
      const res = await fetch(`/api/music-gen/workspaces/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suno_project_id: sunoProjectIdVal.trim() || null }),
      })
      if (res.ok) {
        setWorkspace(prev => prev ? { ...prev, suno_project_id: sunoProjectIdVal.trim() || null } : prev)
      }
    } finally {
      setSavingSunoProjectId(false)
    }
  }

  async function handleAddMidi(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (!sourceRef.trim()) { setAddError('소스를 입력하세요'); return }
    if (sourceType === 'youtube_video' && ytStatus !== 'valid') { setAddError('유효한 YouTube URL을 입력하세요'); return }

    let resolvedSourceRef = sourceRef
    let coverImageData: string | null = null

    if (sourceType === 'mp3_file' && mp3File) {
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', mp3File)
        const upRes = await fetch('/api/music-gen/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        if (!upRes.ok) throw new Error(upData.error?.message ?? '업로드 실패')
        resolvedSourceRef = upData.data?.path ?? upData.path ?? sourceRef
      } finally {
        setUploading(false)
      }

      // Convert cover art blob URL to data URL for storage
      if (mp3Cover) {
        try {
          const blob = await fetch(mp3Cover).then(r => r.blob())
          coverImageData = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        } catch { /* cover art is optional */ }
      }
    }

    setAddingMidi(true)
    try {
      const res = await fetch(`/api/music-gen/workspaces/${id}/midis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_ref: resolvedSourceRef,
          label: label || undefined,
          gen_mode: 'auto',
          original_ratio: 50,
          cover_image: coverImageData || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '오류가 발생했습니다')
      const savedMidi = data?.data ?? data
      fetch(`/api/music-gen/workspaces/${id}/midis/${savedMidi.id}/analyze`, { method: 'POST' }).catch(() => {})
      setMidis(prev => [...prev, { ...savedMidi, cover_count: 0 }])
      // 새 원곡이 처리 중이므로 폴링 즉시 시작
      if (pollRef.current) clearTimeout(pollRef.current)
      pollRef.current = setTimeout(() => loadData(true), 3000)
      setShowAddMidi(false)
      setSourceType('youtube_video'); setSourceRef(''); setLabel('')
      setYtStatus('idle'); setYtTitle(null)
      setMp3File(null)
      if (mp3Cover) { URL.revokeObjectURL(mp3Cover); setMp3Cover(null) }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setAddingMidi(false)
    }
  }

  function handleCancelAdd() {
    setShowAddMidi(false)
    if (mp3Cover) { URL.revokeObjectURL(mp3Cover); setMp3Cover(null) }
    setMp3File(null); setUploading(false)
    setYtStatus('idle'); setYtTitle(null)
    setAddError('')
  }

  if (loading) {
    return <div className="space-y-4">
      <div className="h-8 bg-accent rounded-lg animate-pulse w-48" />
      <div className="h-32 bg-accent rounded-lg animate-pulse" />
    </div>
  }

  if (!workspace) {
    return <div className="text-muted-foreground">워크스페이스를 찾을 수 없습니다.</div>
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={editNameVal}
                onChange={e => setEditNameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="text-xl font-semibold bg-background border border-input rounded px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button variant="ghost" size="sm" onClick={handleSaveName} disabled={savingName} className="text-xs text-primary hover:opacity-80 disabled:opacity-50">저장</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingName(false)} className="text-xs text-muted-foreground hover:text-foreground">취소</Button>
            </div>
          ) : (
            <h1
              className="text-xl font-semibold text-foreground cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => { setEditNameVal(workspace.name); setEditingName(true) }}
              title="클릭하여 이름 편집"
            >
              {workspace.name}
            </h1>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {workspace.suno_account_label && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400">
                <img src="https://suno.com/favicon.ico" alt="" className="w-3 h-3 rounded-sm" />
                {workspace.suno_account_label}
              </span>
            )}
            {workspace.channel_name && (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {channelThumb && <img src={channelThumb} alt="" className="w-4 h-4 rounded-full object-cover" />}
                  {workspace.channel_name}
                </span>
              </>
            )}
          </div>
        </div>
        {!showAddMidi && (
          <Button
            onClick={() => setShowAddMidi(true)}
            className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-sm rounded-lg transition-opacity"
          >
            + 원곡 추가
          </Button>
        )}
      </div>

      {/* 원곡 추가 폼 */}
      {showAddMidi && (
        <div className="bg-background border border-border rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">새 원곡 추가</h2>
          <form onSubmit={handleAddMidi} className="space-y-4">
            {/* 소스 타입 */}
            <div>
              <Label className="block text-xs font-medium text-foreground mb-2">소스 타입</Label>
              <div className="flex gap-6">
                {([
                  { value: 'youtube_video', label: 'YouTube' },
                  { value: 'mp3_file', label: 'MP3 파일' },
                ] as const).map(opt => (
                  <Label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="source_type"
                      value={opt.value}
                      checked={sourceType === opt.value}
                      onChange={() => { setSourceType(opt.value); setSourceRef(''); setLabel(''); setYtStatus('idle'); setYtTitle(null); if (mp3Cover) { URL.revokeObjectURL(mp3Cover); setMp3Cover(null) } }}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <span className="text-sm text-foreground">{opt.label}</span>
                  </Label>
                ))}
              </div>
            </div>

            {/* URL / 파일 */}
            <div>
              {sourceType === 'youtube_video' ? (
                <>
                  <Label className="block text-xs font-medium text-foreground mb-1">YouTube URL</Label>
                  <Input
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
                  {ytStatus === 'valid' && getMidiThumbnail('youtube_video', sourceRef) && (
                    <img src={getMidiThumbnail('youtube_video', sourceRef)!} alt="" className="mt-2 w-40 aspect-video object-cover rounded-md border border-border" />
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
                  <Label className="block text-xs font-medium text-foreground mb-1">MP3 파일</Label>
                  <Input
                    type="file"
                    accept="audio/mp3,audio/mpeg,.mp3"
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setMp3File(file)
                      setSourceRef(file.name)
                      setLabel(prev => prev || file.name.replace(/\.[^.]+$/, ''))
                      if (mp3Cover) URL.revokeObjectURL(mp3Cover)
                      const cover = await extractMp3Cover(file)
                      setMp3Cover(cover)
                    }}
                    className="w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-accent file:text-foreground hover:file:bg-accent/80 cursor-pointer"
                  />
                  {mp3Cover && <img src={mp3Cover} alt="" className="mt-2 w-40 h-40 object-cover rounded-md border border-border" />}
                </>
              )}
            </div>

            {/* 라벨 */}
            <div>
              <Label className="block text-xs font-medium text-foreground mb-1">라벨 (선택)</Label>
              <Input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="예: 기억의 빈자리 커버"
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {addError && <p className="text-sm text-red-500">{addError}</p>}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" onClick={handleCancelAdd} className="px-4 py-2 bg-accent hover:bg-accent/80 text-foreground text-sm rounded-lg transition-colors">
                취소
              </Button>
              <Button
                type="submit"
                disabled={addingMidi || uploading || !sourceRef.trim() || (sourceType === 'youtube_video' && ytStatus !== 'valid') || ytStatus === 'checking'}
                className="px-4 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-sm rounded-lg transition-opacity"
              >
                {uploading ? '업로드 중...' : addingMidi ? '저장 중...' : '저장'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* MIDI 카드 그리드 */}
      {!showAddMidi && midis.length === 0 && (
        <div className="bg-background border border-dashed border-border rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground mb-3">아직 원곡이 없습니다.</p>
          <Button
            onClick={() => setShowAddMidi(true)}
            className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-sm rounded-lg transition-opacity"
          >
            첫 원곡 추가
          </Button>
        </div>
      )}
      {!showAddMidi && midis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {midis.map(midi => {
            const st = STATUS_LABELS[midi.status] ?? STATUS_LABELS.pending
            const thumbnail = getMidiThumbnail(midi.source_type, midi.source_ref, midi.cover_image)
            return (
              <Link
                key={midi.id}
                href={`/workspaces/${id}/midis/${midi.id}`}
                className="bg-background border border-border rounded-lg overflow-hidden shadow-sm hover:border-ring/50 transition-colors"
              >
                {thumbnail && (
                  <div className="w-full aspect-video bg-accent overflow-hidden">
                    <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{midi.label ?? 'MIDI'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{SOURCE_TYPE_LABELS[midi.source_type] ?? midi.source_type}</p>
                    </div>
                    <span className={`flex-shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{((d) => `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`)(new Date(midi.created_at))}</span>
                    <span>Cover {midi.cover_count}곡</span>
                  </div>
                  {!thumbnail && midi.source_ref && (
                    <p className="text-[11px] text-muted-foreground mt-2 truncate">{midi.source_ref}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* 후반 작업 링크 */}
      {midis.some(m => m.status === 'done') && (
        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">후반 작업</p>
          <div className="flex flex-wrap gap-2">
            {[
              { href: 'images', label: '이미지 연결' },
              { href: 'merge', label: '머지 순서' },
              { href: 'upload', label: 'YouTube 업로드' },
              { href: 'shorts', label: '쇼츠 제작' },
            ].map(item => (
              <Link
                key={item.href}
                href={`/workspaces/${id}/${item.href}`}
                className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-muted-foreground hover:border-input transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
