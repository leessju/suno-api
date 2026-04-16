'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

function AddMidiModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [tab, setTab] = useState<'youtube' | 'mp3'>('youtube')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/music-gen/workspaces')
      .then(r => r.json())
      .then(d => {
        const list: Workspace[] = d.data ?? []
        setWorkspaces(list)
        if (list.length > 0) setWorkspaceId(list[0].id)
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!workspaceId) { setError('워크스페이스를 선택해 주세요.'); return }

    setSubmitting(true)
    try {
      let res: Response
      if (tab === 'youtube') {
        if (!url) { setError('URL을 입력해 주세요.'); setSubmitting(false); return }
        res = await fetch(`/api/music-gen/workspaces/${workspaceId}/midis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_type: 'youtube_video', source_ref: url, label: label || undefined }),
        })
      } else {
        if (!file) { setError('파일을 선택해 주세요.'); setSubmitting(false); return }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('workspace_id', workspaceId)
        if (label) fd.append('label', label)
        res = await fetch('/api/music-gen/midis/upload', { method: 'POST', body: fd })
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? '오류가 발생했습니다.')
      } else {
        onSuccess()
        onClose()
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">미디 추가</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground  text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-accent rounded-lg p-1">
          {(['youtube', 'mp3'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground '
              }`}
            >
              {t === 'youtube' ? 'YouTube URL' : 'MP3 업로드'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Workspace select */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">워크스페이스</label>
            <select
              value={workspaceId}
              onChange={e => setWorkspaceId(e.target.value)}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>

          {tab === 'youtube' ? (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">YouTube URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">파일</label>
              <input
                type="file"
                accept=".mp3,.wav,.mp4"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">이름 (선택)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="이름 (선택)"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 rounded-lg text-sm font-medium text-primary-foreground bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary disabled:opacity-50 transition-all"
          >
            {submitting ? '처리 중...' : '추가하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function MidisPage() {
  const [midis, setMidis] = useState<Midi[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  function loadMidis() {
    setLoading(true)
    fetch('/api/music-gen/midis')
      .then(r => r.json())
      .then(d => setMidis(d.data ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadMidis() }, [])

  const statusColor: Record<string, string> = {
    ready: 'text-green-600 bg-green-50 dark:bg-green-900/20',
    converting: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',
    error: 'text-red-600 bg-red-50 dark:bg-red-900/20',
    pending: 'text-muted-foreground bg-accent',
    done: 'text-foreground bg-accent',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">미디파일</h1>
          <p className="text-sm text-muted-foreground mt-1">전체 워크스페이스의 MIDI 파일 목록</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-primary-foreground bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary transition-all"
        >
          미디 추가
        </button>
      </div>

      {showModal && (
        <AddMidiModal
          onClose={() => setShowModal(false)}
          onSuccess={loadMidis}
        />
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
              className="flex items-center gap-4 bg-background border border-border rounded-lg px-4 py-3 hover:border-foreground dark:hover:border-foreground transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {m.label ?? m.source_ref ?? m.id}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.workspace_name} · {m.source_type}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[m.status] ?? statusColor.pending}`}>
                {m.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
