'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface SettingConfig {
  key: string
  label: string
  hint?: string
  secret: boolean
  group: string
}

const SETTINGS: SettingConfig[] = [
  { key: 'cloudflare_account_id', label: 'Account ID', hint: 'Cloudflare 대시보드에서 확인', secret: false, group: 'Cloudflare / R2' },
  { key: 'cloudflare_api_token', label: 'API Token', hint: 'Cloudflare API 토큰', secret: true, group: 'Cloudflare / R2' },
  { key: 'r2_bucket_name', label: 'Bucket Name', hint: 'R2 버킷 이름', secret: false, group: 'Cloudflare / R2' },
  { key: 'r2_access_key_id', label: 'Access Key ID', hint: 'R2 액세스 키', secret: true, group: 'Cloudflare / R2' },
  { key: 'r2_secret_access_key', label: 'Secret Access Key', hint: 'R2 시크릿 키', secret: true, group: 'Cloudflare / R2' },
  { key: 'r2_endpoint', label: 'Endpoint', hint: 'R2 엔드포인트 URL', secret: false, group: 'Cloudflare / R2' },
  { key: 'suno_video_root', label: 'Suno Video Root', hint: 'suno-video 프로젝트 경로', secret: false, group: '경로 설정' },
]

const GROUPS = [...new Set(SETTINGS.map(s => s.group))]

interface SettingState {
  value: string       // 편집 중인 값
  saved: string       // 서버에서 받은 값 (마스킹된 값일 수 있음)
  source: string      // 'db' | 'env' | 'none'
  saving: boolean
  message: string
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingState>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/music-gen/settings/system')
      .then(r => r.json())
      .then(d => {
        const data = d.data ?? d
        const init: Record<string, SettingState> = {}
        for (const cfg of SETTINGS) {
          const info = data[cfg.key]
          init[cfg.key] = {
            value: '',
            saved: info?.value ?? '',
            source: info?.source ?? 'none',
            saving: false,
            message: '',
          }
        }
        setSettings(init)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(key: string) {
    const s = settings[key]
    if (!s || !s.value.trim()) return
    setSettings(prev => ({ ...prev, [key]: { ...prev[key], saving: true, message: '' } }))
    try {
      const res = await fetch('/api/music-gen/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: s.value.trim() }),
      })
      if (res.ok) {
        const cfg = SETTINGS.find(c => c.key === key)
        const displayValue = cfg?.secret ? s.value.trim().slice(0, 8) + '****' : s.value.trim()
        setSettings(prev => ({
          ...prev,
          [key]: { ...prev[key], saved: displayValue, source: 'db', value: '', message: '저장됨' },
        }))
        setTimeout(() => setSettings(prev => ({ ...prev, [key]: { ...prev[key], message: '' } })), 2000)
      } else {
        setSettings(prev => ({ ...prev, [key]: { ...prev[key], message: '저장 실패' } }))
      }
    } finally {
      setSettings(prev => ({ ...prev, [key]: { ...prev[key], saving: false } }))
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground p-6">로딩 중...</div>

  return (
    <div className="w-full max-w-lg space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">시스템 설정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          인프라 및 시스템 레벨 설정을 관리합니다. 등록됨에 저장되어 마이그레이션 시 자동 이전됩니다.
        </p>
      </div>

      {GROUPS.map(group => (
        <div key={group} className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">{group}</h2>
          {SETTINGS.filter(s => s.group === group).map(cfg => {
            const s = settings[cfg.key]
            if (!s) return null
            return (
              <div
                key={cfg.key}
                className={`bg-background border rounded-lg p-5 space-y-3 ${
                  s.saved ? 'border-border' : 'border-dashed border-border/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="block text-sm font-medium text-foreground mb-0.5">{cfg.label}</Label>
                    {cfg.hint && <p className="text-xs text-muted-foreground">{cfg.hint}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {s.source === 'db' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">등록됨</span>
                    )}
                    {s.source === 'env' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">ENV</span>
                    )}
                    {s.source === 'none' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-accent text-muted-foreground">미설정</span>
                    )}
                  </div>
                </div>

                {s.saved && !s.value && (
                  <div className="text-xs font-mono bg-accent px-3 py-1.5 rounded text-foreground">
                    {s.saved}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    type={cfg.secret ? 'password' : 'text'}
                    value={s.value}
                    onChange={e => setSettings(prev => ({ ...prev, [cfg.key]: { ...prev[cfg.key], value: e.target.value } }))}
                    placeholder={s.saved ? '변경하려면 새 값 입력' : cfg.hint ?? ''}
                    className="font-mono flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSave(cfg.key)}
                    disabled={s.saving || !s.value.trim()}
                  >
                    {s.saving ? '...' : s.message || '저장'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
