'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '@/components/Toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ClipRender {
  sort_order: number
  render_id: string
  named_path: string | null
  rendered_at: number
  bg_key: string | null
  lyric_lang: string | null
  lyric_trans: string | null
  title_jp: string | null
  title_en: string | null
  duration: number | null
}

const LANG_LABEL: Record<string, string> = { en: '영어', ja: '일어', ko: '한국어', zh: '중국어', inst: 'Inst.' }

function formatDuration(sec: number | null) {
  if (!sec || sec <= 0) return null
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function RendersPopup({ clipId, renderCount, onClose }: {
  clipId: string
  renderCount: number
  onClose: () => void
}) {
  const [rows, setRows] = useState<ClipRender[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/music-gen/youtube-clips/${clipId}/renders`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clipId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-background border border-border rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">병합된 영상 ({renderCount}개)</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">연결된 렌더 정보가 없습니다.</div>
          ) : rows.map((r, idx) => (
            <div key={r.render_id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-muted-foreground/60 w-5 text-center flex-shrink-0">{idx + 1}</span>
              {r.bg_key ? (
                <img
                  src={`/api/r2/object/${r.bg_key}`}
                  alt=""
                  className="w-10 h-8 rounded object-cover border border-border flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-10 h-8 bg-accent rounded border border-border flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {r.title_jp ?? r.title_en ?? r.named_path ?? r.render_id}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {r.lyric_lang && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                      {LANG_LABEL[r.lyric_lang] ?? r.lyric_lang}
                    </span>
                  )}
                  {r.duration && (
                    <span className="text-[10px] text-muted-foreground/60">{formatDuration(r.duration)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface YoutubeClip {
  id: string
  channel_id: number | null
  title: string
  description: string
  thumbnail_key: string | null
  video_path: string | null
  duration: number | null
  status: 'draft' | 'uploaded'
  youtube_privacy: 'public' | 'private' | 'unlisted' | null
  youtube_video_id: string | null
  channel_name: string | null
  youtube_channel_id: string | null
  render_count: number
  created_at: number
  updated_at: number
}

const PRIVACY_LABEL: Record<string, string> = {
  public: '공개', private: '비공개', unlisted: '미등록',
}
const PRIVACY_COLOR: Record<string, string> = {
  public: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-400',
  private: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  unlisted: 'border-amber-400/40 bg-amber-500/10 text-amber-400',
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 인라인 제목 편집 컴포넌트
function InlineTitle({ clipId, value, onSave }: {
  clipId: string
  value: string
  onSave: (id: string, title: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = async () => {
    if (draft.trim() === value) { setEditing(false); return }
    await onSave(clipId, draft.trim())
    setEditing(false)
  }

  const cancel = () => { setDraft(value); setEditing(false) }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') cancel() }}
        placeholder="제목 입력"
        className="w-full px-1.5 py-0.5 text-sm font-medium border border-primary rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1 text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        <span className="truncate max-w-[220px]">
          {value || <span className="text-muted-foreground italic font-normal">제목 없음</span>}
        </span>
        <svg className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 flex-shrink-0 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.768-6.768a2 2 0 012.828 2.828L11.828 13.828A2 2 0 0110 14.414l-2.414.586.586-2.414A2 2 0 019 11z" />
        </svg>
      </button>
    </div>
  )
}

// 인라인 설명 편집 컴포넌트
function InlineDesc({ clipId, value, onSave }: {
  clipId: string
  value: string
  onSave: (id: string, description: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = async () => {
    if (draft === value) { setEditing(false); return }
    await onSave(clipId, draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        placeholder="YouTube 설명 입력"
        rows={3}
        className="w-full px-1.5 py-0.5 text-xs border border-primary rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none mt-0.5"
      />
    )
  }

  return (
    <div className="flex items-start gap-1 mt-0.5">
      <button
        onClick={() => setEditing(true)}
        className="group inline-flex items-start gap-1 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="line-clamp-2 max-w-[220px]">
          {value || <span className="italic text-muted-foreground/40">—</span>}
        </span>
        <svg className="w-2.5 h-2.5 mt-0.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 flex-shrink-0 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.768-6.768a2 2 0 012.828 2.828L11.828 13.828A2 2 0 0110 14.414l-2.414.586.586-2.414A2 2 0 019 11z" />
        </svg>
      </button>
    </div>
  )
}

interface YoutubeShort {
  id: string
  clip_id: string | null
  channel_id: number | null
  title: string
  description: string
  status: 'draft' | 'uploaded'
  youtube_privacy: 'public' | 'private' | 'unlisted' | null
  youtube_video_id: string | null
  created_at: number
}

// 쇼츠 디테일 패널 — 병합된 렌더 목록 표시, 클릭 시 쇼츠 제작
const rendersCache = new Map<string, ClipRender[]>()

function ShortsPanel({ clip, onClose }: { clip: YoutubeClip; onClose: () => void }) {
  const cached = rendersCache.get(clip.id)
  const [renders, setRenders] = useState<ClipRender[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (rendersCache.has(clip.id)) return
    setLoading(true)
    fetch(`/api/music-gen/youtube-clips/${clip.id}/renders`)
      .then(r => r.json())
      .then(d => {
        const rows = Array.isArray(d) ? d : (d.data ?? [])
        rendersCache.set(clip.id, rows)
        setRenders(rows)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clip.id])

  return (
    <div className="w-full bg-background border border-border rounded-lg overflow-hidden flex flex-col">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-shrink-0">
        <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <svg className="w-3 h-3 text-[#FF0000]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
          </svg>
          쇼츠
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 바디 — 렌더 목록 */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-accent rounded-lg animate-pulse" />)}
          </div>
        ) : renders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-sm text-muted-foreground">병합된 영상이 없습니다.</p>
          </div>
        ) : renders.map((r, idx) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          const renderStatus = (r.named_path ? '클립완성' : '초안') as '초안' | '클립완성' | '업로드완료'
          return (
            <div
              key={r.render_id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/10 transition-colors"
            >
              <span className="text-xs text-muted-foreground/60 w-5 text-center flex-shrink-0">{idx + 1}</span>
              {r.bg_key ? (
                <img
                  src={`/api/r2/object/${r.bg_key}`}
                  alt=""
                  className="w-10 h-8 rounded object-cover border border-border flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-10 h-8 bg-accent rounded border border-border flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {r.title_jp ?? r.title_en ?? r.named_path ?? r.render_id}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                    renderStatus === '업로드완료'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : renderStatus === '클립완성'
                      ? 'bg-sky-500/10 text-sky-400'
                      : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    {renderStatus}
                  </span>
                  {r.lyric_lang && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                      {LANG_LABEL[r.lyric_lang] ?? r.lyric_lang}
                    </span>
                  )}
                  {r.lyric_trans && r.lyric_trans !== 'none' && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 font-medium">
                      번역→{LANG_LABEL[r.lyric_trans] ?? r.lyric_trans}
                    </span>
                  )}
                  {r.duration && (
                    <span className="text-[10px] text-muted-foreground/60">{formatDuration(r.duration)}</span>
                  )}
                </div>
              </div>
              {/* 액션 버튼 */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {/* TODO: 메타데이터 설정 */}}
                  className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors whitespace-nowrap"
                >
                  메타데이터 설정
                </button>
                <button
                  onClick={() => {/* TODO: 쇼츠 업로드 */}}
                  className="text-xs px-3 py-1.5 rounded bg-[#FF0000] text-white hover:bg-[#cc0000] transition-colors whitespace-nowrap"
                >
                  쇼츠 업로드
                </button>
              </div>
            </div>
          )
        })}
        {!loading && renders.length > 0 && (
          <div className="px-4 py-2.5 text-[10px] text-muted-foreground/50 text-center">
            영상을 클릭해서 후렴·주요 구간으로 쇼츠를 만들어보세요
          </div>
        )}
      </div>
    </div>
  )
}

// 메타데이터 설정 팝업
function MetaPopup({ clip, onSave, onClose }: {
  clip: YoutubeClip
  onSave: (id: string, fields: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState(clip.title)
  const [description, setDescription] = useState(clip.description)
  const [privacy, setPrivacy] = useState(clip.youtube_privacy ?? 'private')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(clip.id, { title, description, youtube_privacy: privacy })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md mx-4 bg-background border border-border rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">메타데이터 설정</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">제목</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="YouTube 영상 제목"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">설명</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="YouTube 영상 설명"
              rows={4}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">공개 범위</label>
            <select
              value={privacy}
              onChange={e => setPrivacy(e.target.value as 'public' | 'private' | 'unlisted')}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="private">비공개</option>
              <option value="unlisted">미등록</option>
              <option value="public">공개</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function YoutubeClipsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<YoutubeClip[]>([])
  const [loading, setLoading] = useState(true)
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)
  const [rendersPopup, setRendersPopup] = useState<{ clipId: string; count: number } | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'uploaded'>('all')
  const [metaPopupClip, setMetaPopupClip] = useState<YoutubeClip | null>(null)
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set())
  const [uploadConfirmId, setUploadConfirmId] = useState<string | null>(null)
  const [shortsClip, setShortsClip] = useState<YoutubeClip | null>(null)

  const openShortsClip = useCallback((clip: YoutubeClip) => {
    setShortsClip(clip)
    localStorage.setItem('yt-shorts-clip-id', clip.id)
  }, [])

  const closeShortsClip = useCallback(() => {
    setShortsClip(null)
    localStorage.removeItem('yt-shorts-clip-id')
  }, [])

  const fetchClips = useCallback(() => {
    fetch('/api/music-gen/youtube-clips')
      .then(r => r.json())
      .then(d => {
        const rows: YoutubeClip[] = Array.isArray(d) ? d : (d.data ?? [])
        setItems(rows)
        // localStorage에 저장된 clip 복원
        const savedId = localStorage.getItem('yt-shorts-clip-id')
        if (savedId) {
          const found = rows.find(c => c.id === savedId)
          if (found) setShortsClip(found)
          else localStorage.removeItem('yt-shorts-clip-id')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchClips() }, [fetchClips])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPlayerUrl(null); setRendersPopup(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const saveField = useCallback(async (id: string, fields: Record<string, string>) => {
    const res = await fetch(`/api/music-gen/youtube-clips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i))
    } else {
      toast('저장 실패')
    }
  }, [toast])

  const saveTitle = useCallback(async (id: string, title: string) => {
    await saveField(id, { title })
  }, [saveField])

  const saveDesc = useCallback(async (id: string, description: string) => {
    await saveField(id, { description })
  }, [saveField])

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/music-gen/youtube-clips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: status as YoutubeClip['status'] } : i))
    } else {
      toast('상태 변경 실패')
    }
  }

  const updatePrivacy = async (id: string, youtube_privacy: string) => {
    const res = await fetch(`/api/music-gen/youtube-clips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_privacy }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, youtube_privacy: youtube_privacy as YoutubeClip['youtube_privacy'] } : i))
    } else {
      toast('공개 범위 변경 실패')
    }
  }

  const deleteClip = async (id: string) => {
    const res = await fetch(`/api/music-gen/youtube-clips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleted: true }),
    })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id))
    } else {
      toast('삭제 실패')
    }
  }

  const uploadToYoutube = async (id: string) => {
    setUploadingIds(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/music-gen/youtube-clips/${id}/upload`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast(`YouTube 업로드 완료! 영상 ID: ${data.youtube_video_id ?? data.data?.youtube_video_id}`)
        setItems(prev => prev.map(i => i.id === id
          ? { ...i, status: 'uploaded', youtube_video_id: data.youtube_video_id ?? data.data?.youtube_video_id }
          : i
        ))
      } else {
        toast(`업로드 실패: ${data.error ?? data.message ?? '알 수 없는 오류'}`)
      }
    } catch {
      toast('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploadingIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  return (
    <>
      {rendersPopup && (
        <RendersPopup
          clipId={rendersPopup.clipId}
          renderCount={rendersPopup.count}
          onClose={() => setRendersPopup(null)}
        />
      )}

      <AlertDialog open={!!uploadConfirmId} onOpenChange={open => { if (!open) setUploadConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>YouTube 업로드</AlertDialogTitle>
            <AlertDialogDescription>
              정말 영상을 YouTube에 업로드 하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#FF0000] text-white hover:bg-[#cc0000]"
              onClick={() => { if (uploadConfirmId) { uploadToYoutube(uploadConfirmId); setUploadConfirmId(null) } }}
            >
              업로드
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {metaPopupClip && (
        <MetaPopup
          clip={metaPopupClip}
          onSave={saveField}
          onClose={() => setMetaPopupClip(null)}
        />
      )}

      {playerUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPlayerUrl(null)}
        >
          <div className="relative w-full max-w-3xl mx-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPlayerUrl(null)} className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm">
              닫기 (ESC)
            </button>
            <video src={playerUrl} controls autoPlay className="w-full rounded-lg shadow-2xl" />
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">YouTube 클립</h1>
          <p className="text-sm text-muted-foreground mt-1">병합 영상을 YouTube용으로 관리하는 공간</p>
        </div>

        {/* 필터 영역 */}
        <div className="flex items-end gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground"># 상태</span>
            <Select value={filterStatus} onValueChange={v => setFilterStatus(v as 'all' | 'draft' | 'uploaded')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="모두" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모두</SelectItem>
                <SelectItem value="draft">초안</SelectItem>
                <SelectItem value="uploaded">업로드완료</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className={`${shortsClip ? 'w-1/2' : 'w-full'} transition-all duration-200 min-w-0`}>
        {(() => {
          const filtered = items.filter(i => filterStatus === 'all' || i.status === filterStatus)
          return loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-accent rounded-lg animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <p>YouTube 클립이 없습니다.</p>
            <p className="text-xs mt-1">렌더영상 페이지에서 영상을 병합하면 여기에 추가됩니다.</p>
          </div>
        ) : (
          <div className="bg-background border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-medium text-foreground">
                클립 목록 ({filtered.length}개{filterStatus !== 'all' ? ` / 전체 ${items.length}개` : ''})
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                해당 상태의 클립이 없습니다.
              </div>
            ) : filtered.map(clip => (
              <div key={clip.id} className="border-b border-border last:border-0 hover:bg-accent/10 transition-colors">
                <div className="flex items-center gap-3 px-4 py-4">
                  {/* 썸네일 */}
                  {clip.thumbnail_key ? (
                    <img
                      src={`/api/r2/object/${clip.thumbnail_key}`}
                      alt=""
                      className="w-16 h-12 rounded object-cover border border-border flex-shrink-0 mt-0.5 cursor-pointer"
                      onClick={() => setPlayerUrl(`/api/music-gen/youtube-clips/${clip.id}/video`)}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <button
                      onClick={() => setPlayerUrl(`/api/music-gen/youtube-clips/${clip.id}/video`)}
                      className="w-16 h-12 bg-accent rounded border border-border flex-shrink-0 mt-0.5 flex items-center justify-center hover:bg-accent/80 transition-colors"
                    >
                      <svg className="w-5 h-5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                      </svg>
                    </button>
                  )}

                  {/* 본문 */}
                  <div className="flex-1 min-w-0">
                    <InlineTitle clipId={clip.id} value={clip.title} onSave={saveTitle} />
                    <InlineDesc clipId={clip.id} value={clip.description} onSave={saveDesc} />

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {/* 초안 배지 — 클릭 불가, N개 병합 왼쪽 */}
                      {clip.status === 'draft' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-900/20">
                          초안
                        </span>
                      )}
                      {clip.status === 'uploaded' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          업로드완료
                        </span>
                      )}
                      <button
                        onClick={() => setRendersPopup({ clipId: clip.id, count: clip.render_count })}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-400/40 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                      >
                        <span className="text-[10px] text-blue-400/80"><span className="font-extrabold">{clip.render_count}</span>개 병합</span>
                      </button>
                      {clip.duration && (
                        <span className="text-[10px] text-muted-foreground/60 font-medium tabular-nums">{formatDuration(clip.duration)}</span>
                      )}
                    </div>
                  </div>

                  {/* 우측 액션 */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {/* uploaded 상태일 때 공개 범위 select */}
                    {clip.status === 'uploaded' && (
                      <select
                        value={clip.youtube_privacy ?? 'private'}
                        onChange={e => updatePrivacy(clip.id, e.target.value)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium bg-transparent cursor-pointer focus:outline-none ${PRIVACY_COLOR[clip.youtube_privacy ?? 'private']}`}
                      >
                        <option value="public">공개</option>
                        <option value="private">비공개</option>
                        <option value="unlisted">미등록</option>
                      </select>
                    )}

                    {/* 메타데이터 설정 · 유튜브업로드 · 삭제 */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMetaPopupClip(clip)}
                        className="text-sm px-4 py-1.5 border border-border rounded-md text-foreground hover:bg-accent transition-colors whitespace-nowrap"
                      >
                        메타데이터 설정
                      </button>
                      <button
                        onClick={() => openShortsClip(clip)}
                        className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md bg-white border border-[#FF0000]/30 text-[#FF0000] hover:bg-red-50 transition-colors whitespace-nowrap shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5 text-[#FF0000]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
                        </svg>
                        쇼츠 보기
                      </button>
                      <button
                        onClick={() => setUploadConfirmId(clip.id)}
                        disabled={uploadingIds.has(clip.id)}
                        className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md bg-[#FF0000] text-white hover:bg-[#cc0000] transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {uploadingIds.has(clip.id) ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                            </svg>
                            업로드 중…
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                            유튜브업로드
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => deleteClip(clip.id)}
                        className="text-xs font-medium text-destructive hover:text-destructive/70 transition-colors ml-1"
                      >
                        삭제
                      </button>
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums text-right">{formatDate(clip.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
        })()}
          </div>
          {shortsClip && (
            <div className="w-1/2 flex-shrink-0 animate-in slide-in-from-right-8 fade-in duration-300">
              <ShortsPanel clip={shortsClip} onClose={closeShortsClip} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
