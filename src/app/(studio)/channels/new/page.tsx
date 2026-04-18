'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface YouTubeChannel {
  id: string
  title: string
  handle: string | null
  thumbnail: string | null
  subscriberCount: number | null
  videoCount: number | null
  tokenName: string
  registered: boolean
  registeredId?: number
  tokenExpired: boolean
}

export default function NewChannelPage() {
  const router = useRouter()
  const [channels, setChannels] = useState<YouTubeChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<YouTubeChannel | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [lyricFormat, setLyricFormat] = useState<'jp2_en1' | 'free' | 'jp_tagged'>('jp2_en1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/music-gen/channels/youtube-channels')
      .then(r => r.json())
      .then(d => setChannels(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRegister() {
    if (!selected) return
    setError('')
    setSaving(true)

    try {
      const res = await fetch('/api/music-gen/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_name: selected.title,
          youtube_channel_id: selected.id,
          channel_handle: selected.handle || undefined,
          system_prompt: systemPrompt,
          lyric_format: lyricFormat,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '채널 등록 실패')

      const channel = data.data ?? data
      router.push(`/channels/${channel.youtube_channel_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  const availableChannels = channels.filter(ch => !ch.registered && !ch.tokenExpired)
  const registeredChannels = channels.filter(ch => ch.registered)
  const expiredChannels = channels.filter(ch => ch.tokenExpired)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">채널 추가</h1>
        <p className="text-sm text-muted-foreground mt-1">YouTube 채널을 선택하여 등록하세요.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-accent rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* 등록 가능한 채널 */}
          {availableChannels.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-foreground">등록 가능한 채널</h2>
              {availableChannels.map(ch => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelected(selected?.id === ch.id ? null : ch)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    selected?.id === ch.id
                      ? 'border-foreground/40 bg-accent'
                      : 'border-border hover:border-foreground/20'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-accent border border-border flex-shrink-0">
                    {ch.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ch.thumbnail} alt={ch.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                        {ch.title.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ch.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {ch.handle ? `@${ch.handle}` : ch.id}
                      {ch.subscriberCount !== null && ` · 구독자 ${ch.subscriberCount}`}
                      {ch.videoCount !== null && ` · 영상 ${ch.videoCount}`}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                    selected?.id === ch.id ? 'border-foreground bg-foreground' : 'border-border'
                  }`}>
                    {selected?.id === ch.id && (
                      <svg className="w-full h-full text-background" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 이미 등록된 채널 */}
          {registeredChannels.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">등록됨</h2>
              {registeredChannels.map(ch => (
                <div
                  key={ch.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 opacity-60"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-accent border border-border flex-shrink-0">
                    {ch.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ch.thumbnail} alt={ch.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                        {ch.title.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ch.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {ch.handle ? `@${ch.handle}` : ch.id}
                    </p>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0">추가됨</span>
                </div>
              ))}
            </div>
          )}

          {/* 토큰 만료 */}
          {expiredChannels.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">재인증 필요</h2>
              {expiredChannels.map((ch, i) => {
                const displayName = ch.title !== ch.tokenName ? ch.title : ch.tokenName
                return (
                  <div
                    key={`expired-${i}`}
                    className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800 px-4 py-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-600 text-sm font-semibold">{displayName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">YouTube 토큰 만료 — 재인증 필요</p>
                    </div>
                    <a
                      href={`/api/music-gen/youtube/oauth/start?channel_name=${ch.tokenName}`}
                      className="flex-shrink-0 text-xs px-3 py-1.5 rounded border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    >
                      재인증
                    </a>
                  </div>
                )
              })}
            </div>
          )}

          {channels.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              YouTube 토큰이 없습니다. 설정에서 Google OAuth를 인증하세요.
            </div>
          )}

          {/* 선택된 채널 등록 폼 */}
          {selected && (
            <div className="border border-border rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">{selected.title} 등록 설정</h2>

              <div>
                <Label className="text-sm font-medium">가사 형식</Label>
                <select
                  value={lyricFormat}
                  onChange={e => setLyricFormat(e.target.value as typeof lyricFormat)}
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="jp2_en1">일본어 2절 + 영어 1절</option>
                  <option value="free">자유 형식</option>
                  <option value="jp_tagged">일본어 태그 형식</option>
                </select>
              </div>

              <div>
                <Label className="text-sm font-medium">시스템 프롬프트</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="이 채널의 음악 생성에 사용할 시스템 프롬프트를 입력하세요..."
                  rows={6}
                  className="mt-1.5 resize-y"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleRegister} disabled={saving || !systemPrompt.trim()}>
                  {saving ? '등록 중...' : '채널 등록'}
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  취소
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button variant="outline" onClick={() => router.push('/channels')}>
              돌아가기
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
