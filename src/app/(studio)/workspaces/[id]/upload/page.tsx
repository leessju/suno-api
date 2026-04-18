'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface UploadResult {
  id: string
  workspace_id: string
  youtube_video_id: string | null
  title: string
  description: string | null
  status: 'pending' | 'running' | 'done' | 'failed'
  error_message: string | null
  uploaded_at: number | null
  created_at: number
}

const STATUS_LABEL: Record<UploadResult['status'], string> = {
  pending: '대기 중',
  running: '업로드 중',
  done: '완료',
  failed: '실패',
}

const STATUS_CLASS: Record<UploadResult['status'], string> = {
  pending: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  running: 'bg-accent dark:bg-accent text-foreground',
  done: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  failed: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
}

export default function UploadPage({ params }: { params: { id: string } }) {
  const [results, setResults] = useState<UploadResult[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')

  const loadResults = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/music-gen/workspaces/${params.id}/upload`)
    const data = await res.json()
    setResults(data.data ?? [])
    setLoading(false)
  }, [params.id])

  useEffect(() => { loadResults() }, [loadResults])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError('제목을 입력하세요'); return }
    setSubmitting(true)
    setFormError('')
    try {
      const res = await fetch(`/api/music-gen/workspaces/${params.id}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '업로드 요청 실패')
      setTitle('')
      setDescription('')
      setShowForm(false)
      await loadResults()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">YouTube 업로드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            머지된 영상을 YouTube에 업로드합니다
          </p>
        </div>
        <Button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-colors w-full sm:w-auto"
        >
          {showForm ? '취소' : '업로드 요청'}
        </Button>
      </div>

      {showForm && (
        <div className="bg-background border border-border rounded-xl p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">새 업로드 요청</h2>

            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-sm">
                {formError}
              </div>
            )}

            <div>
              <Label className="block text-sm font-medium text-foreground mb-1.5">
                영상 제목
              </Label>
              <Input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="YouTube에 표시될 제목"
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-foreground text-sm"
              />
            </div>

            <div>
              <Label className="block text-sm font-medium text-foreground mb-1.5">
                설명 (선택)
              </Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="영상 설명을 입력하세요"
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-foreground text-sm resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-primary-foreground font-medium rounded-md transition-colors text-sm"
            >
              {submitting ? '요청 중...' : '업로드 시작'}
            </Button>
          </form>
        </div>
      )}

      {loading && (
        <div className="text-sm text-muted-foreground">로딩 중...</div>
      )}

      {!loading && results.length === 0 && !showForm && (
        <div className="p-6 bg-background border border-border rounded-xl text-center">
          <p className="text-sm text-muted-foreground">
            아직 업로드 요청이 없습니다. 위 버튼으로 업로드를 시작하세요.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {results.map(result => (
          <div
            key={result.id}
            className="p-4 bg-background border border-border rounded-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {result.title}
                </p>
                {result.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {result.description}
                  </p>
                )}
                {result.youtube_video_id && (
                  <p className="text-xs text-foreground mt-1 font-mono">
                    youtu.be/{result.youtube_video_id}
                  </p>
                )}
                {result.error_message && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                    {result.error_message}
                  </p>
                )}
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_CLASS[result.status]}`}>
                {STATUS_LABEL[result.status]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {((d) => `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)(new Date(result.created_at))}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
