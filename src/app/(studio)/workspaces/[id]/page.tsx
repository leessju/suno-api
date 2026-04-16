'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface WorkspaceMidi {
  id: string
  label: string | null
  source_type: string
  source_ref: string | null
  gen_mode: string
  original_ratio: number
  status: string
  error_message: string | null
  track_count: number
  created_at: number
}

interface Workspace {
  id: string
  name: string
  pipeline_mode: string
  status: string
  suno_sync_status: string
  suno_workspace_id: string | null
  channel_name: string | null
  suno_account_label: string | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: '대기', color: 'bg-accent text-muted-foreground' },
  converting: { label: '변환 중', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  ready:      { label: '준비', color: 'bg-accent text-foreground' },
  generating: { label: '생성 중', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
  done:       { label: '완료', color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
  error:      { label: '오류', color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
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
  const [showAddMidi, setShowAddMidi] = useState(searchParams.get('add_midi') === '1')

  // MIDI 추가 폼 상태
  const [newMidi, setNewMidi] = useState({ source_type: 'youtube_video', source_ref: '', label: '', gen_mode: 'auto', original_ratio: 50 })
  const [addingMidi, setAddingMidi] = useState(false)
  const [addError, setAddError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [wsRes, midiRes] = await Promise.all([
        fetch(`/api/music-gen/workspaces/${id}`),
        fetch(`/api/music-gen/workspaces/${id}/midis`),
      ])
      const wsData = await wsRes.json()
      const midiData = await midiRes.json()
      setWorkspace(wsData.data)
      setMidis(midiData.data ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  async function handleAddMidi(e: React.FormEvent) {
    e.preventDefault()
    setAddingMidi(true)
    setAddError('')
    try {
      const res = await fetch(`/api/music-gen/workspaces/${id}/midis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: newMidi.source_type,
          source_ref: newMidi.source_ref || undefined,
          label: newMidi.label || undefined,
          gen_mode: newMidi.gen_mode,
          original_ratio: newMidi.original_ratio,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? 'Failed')
      setMidis(prev => [...prev, { ...data.data, track_count: 0 }])
      setShowAddMidi(false)
      setNewMidi({ source_type: 'youtube_video', source_ref: '', label: '', gen_mode: 'auto', original_ratio: 50 })
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setAddingMidi(false)
    }
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
          <h1 className="text-xl font-semibold text-foreground">{workspace.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {workspace.suno_account_label && (
              <span className="text-xs text-muted-foreground">{workspace.suno_account_label}</span>
            )}
            {workspace.channel_name && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{workspace.channel_name}</span>
              </>
            )}
            <span className="text-muted-foreground">·</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              workspace.suno_sync_status === 'synced' ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              : workspace.suno_sync_status === 'sync_failed' ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400'
              : 'bg-accent text-muted-foreground'
            }`}>
              {workspace.suno_sync_status === 'synced' ? '싱크됨' : workspace.suno_sync_status === 'sync_failed' ? '싱크 실패' : '로컬'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowAddMidi(true)}
          className="px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-sm rounded-lg transition-colors"
        >
          + MIDI 추가
        </button>
      </div>

      {/* MIDI 추가 폼 */}
      {showAddMidi && (
        <div className="bg-background border border-border rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">새 MIDI 추가</h2>
          <form onSubmit={handleAddMidi} className="space-y-4">
            {addError && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">{addError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">소스 타입</label>
                <select
                  value={newMidi.source_type}
                  onChange={e => setNewMidi(p => ({ ...p, source_type: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="youtube_video">YouTube</option>
                  <option value="mp3_file">MP3</option>
                  <option value="direct_midi">MIDI 직접</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">생성 모드</label>
                <select
                  value={newMidi.gen_mode}
                  onChange={e => setNewMidi(p => ({ ...p, gen_mode: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="auto">자동</option>
                  <option value="manual">수동</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">소스 URL / 경로</label>
              <input
                type="text"
                value={newMidi.source_ref}
                onChange={e => setNewMidi(p => ({ ...p, source_ref: e.target.value }))}
                placeholder="https://youtube.com/watch?v=... 또는 /path/to/file.mp3"
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">라벨 (선택)</label>
              <input
                type="text"
                value={newMidi.label}
                onChange={e => setNewMidi(p => ({ ...p, label: e.target.value }))}
                placeholder="예: 기억의 빈자리 커버"
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                원곡:스타일 비율 — {newMidi.original_ratio}% 원곡
              </label>
              <input
                type="range"
                min={0} max={100} step={5}
                value={newMidi.original_ratio}
                onChange={e => setNewMidi(p => ({ ...p, original_ratio: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>순수 스타일</span>
                <span>균형</span>
                <span>원곡 밀착</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={addingMidi} className="px-4 py-2 bg-primary hover:bg-primary disabled:opacity-50 text-primary-foreground text-sm rounded-md transition-colors">
                {addingMidi ? '추가 중...' : 'MIDI 추가'}
              </button>
              <button type="button" onClick={() => setShowAddMidi(false)} className="px-4 py-2 bg-accent hover:bg-background dark:hover:bg-accent text-foreground text-sm rounded-md transition-colors">
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MIDI 카드 그리드 */}
      {midis.length === 0 && !showAddMidi ? (
        <div className="bg-background border border-dashed border-border rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground mb-3">아직 MIDI가 없습니다.</p>
          <button
            onClick={() => setShowAddMidi(true)}
            className="px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-sm rounded-lg transition-colors"
          >
            첫 MIDI 추가
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {midis.map(midi => {
            const st = STATUS_LABELS[midi.status] ?? STATUS_LABELS.pending
            return (
              <Link
                key={midi.id}
                href={`/workspaces/${id}/midis/${midi.id}`}
                className="bg-background border border-border rounded-lg p-4 shadow-sm hover:border-border dark:hover:border-foreground transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{midi.label ?? 'MIDI'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{SOURCE_TYPE_LABELS[midi.source_type] ?? midi.source_type}</p>
                  </div>
                  <span className={`flex-shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                    {st.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{midi.gen_mode === 'auto' ? '자동' : '수동'} · {midi.original_ratio}% 원곡</span>
                  <span>{midi.track_count}개 트랙</span>
                </div>
                {midi.source_ref && (
                  <p className="text-[11px] text-muted-foreground mt-2 truncate">{midi.source_ref}</p>
                )}
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
                className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-muted-foreground hover:border-input  transition-colors"
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
