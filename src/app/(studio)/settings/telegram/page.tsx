'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function TelegramSettingsPage() {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/music-gen/settings/telegram')
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setBotToken(d.data.bot_token ?? '')
          setChatId(d.data.chat_id ?? '')
          setEnabled(!!d.data.enabled)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/music-gen/settings/telegram', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: botToken, chat_id: chatId, enabled }),
      })
      if (res.ok) setMessage('텔레그램 설정이 저장되었습니다.')
      else setMessage('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">로딩 중...</div>

  return (
    <div className="w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">텔레그램 설정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          생성 완료 알림을 텔레그램으로 받으려면 봇 토큰과 Chat ID를 입력하세요.
        </p>
      </div>

      <div className="bg-background border border-border rounded-lg p-6">
        {message && (
          <div className="mb-4 p-3 bg-accent border border-border rounded-md text-foreground text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label className="block text-sm font-medium text-foreground mb-1.5">
              봇 토큰 <span className="text-xs text-muted-foreground font-normal">(@BotFather에서 발급)</span>
            </Label>
            <Input
              type="text"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="1234567890:AAF..."
              className="font-mono"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-foreground mb-1.5">
              Chat ID <span className="text-xs text-muted-foreground font-normal">(@userinfobot으로 확인)</span>
            </Label>
            <Input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              placeholder="-1001234567890"
              className="font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEnabled(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-foreground">알림 활성화</span>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="w-full"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </form>

        <div className="mt-4 p-3 bg-accent rounded-md">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">설정 방법:</strong><br />
            1. @BotFather에서 /newbot으로 봇 생성 → 토큰 복사<br />
            2. 봇을 채널/그룹에 추가<br />
            3. @userinfobot으로 Chat ID 확인
          </p>
        </div>
      </div>
    </div>
  )
}
