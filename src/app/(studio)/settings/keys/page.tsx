'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// ── 일반 키 관리 ──────────────────────────────────────────────

type KeyType = 'youtube_api_key' | 'telegram_bot_token' | 'telegram_chat_id' | 'two_captcha_key' | 'google_oauth_client_id' | 'google_oauth_client_secret'

interface KeyConfig { type: KeyType; label: string; placeholder: string; hint?: string }
interface KeyGroup { title: string; keys: KeyConfig[] }

const KEY_GROUPS: KeyGroup[] = [
  {
    title: 'YouTube',
    keys: [
      { type: 'youtube_api_key', label: 'API Key', placeholder: 'AIza...', hint: 'Google Cloud Console에서 발급' },
    ],
  },
  {
    title: 'Google OAuth',
    keys: [
      { type: 'google_oauth_client_id', label: 'Client ID', placeholder: '703863...', hint: 'GCP Console → API 및 서비스 → 사용자 인증 정보' },
      { type: 'google_oauth_client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', hint: 'Client ID와 같은 위치' },
    ],
  },
  {
    title: 'Telegram',
    keys: [
      { type: 'telegram_bot_token', label: 'Bot Token', placeholder: '1234567890:AAF...', hint: '@BotFather에서 /newbot으로 생성' },
      { type: 'telegram_chat_id', label: 'Chat ID', placeholder: '-1001234567890', hint: '@userinfobot으로 확인' },
    ],
  },
  {
    title: '2Captcha',
    keys: [
      { type: 'two_captcha_key', label: 'API Key', placeholder: '...', hint: '2captcha.com 대시보드에서 발급' },
    ],
  },
]

// flat list for initialization
const KEY_CONFIGS = KEY_GROUPS.flatMap(g => g.keys)

function maskValue(value: string): string {
  if (!value || value.length <= 4) return '****'
  return value.slice(0, 4) + '****'
}

interface KeyState {
  value: string
  saved: string
  saving: boolean
  message: string
}

// ── Gemini 계정 ──────────────────────────────────────────────

type GeminiAccountType = 'gemini-api' | 'vertex-ai-apikey'

interface GeminiAccount {
  id: number
  name: string
  type: GeminiAccountType
  api_key: string
  project: string | null
  location: string | null
  priority: number
  is_active: boolean
}


export default function KeysPage() {
  // 일반 키
  const [keys, setKeys] = useState<Record<KeyType, KeyState>>(
    Object.fromEntries(
      KEY_CONFIGS.map(k => [k.type, { value: '', saved: '', saving: false, message: '' }])
    ) as Record<KeyType, KeyState>
  )
  const [loading, setLoading] = useState(true)

  // Gemini 계정
  const [accounts, setAccounts] = useState<GeminiAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAccount, setNewAccount] = useState({
    name: '',
    type: 'gemini-api' as GeminiAccountType,
    api_key: '',
    project: '',
    location: 'us-central1',
  })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  // Gemini 모델
  const GEMINI_MODELS = [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
  ]
  const [geminiModel, setGeminiModel] = useState('')
  const [modelSaving, setModelSaving] = useState(false)

  useEffect(() => {
    fetch('/api/music-gen/settings/keys')
      .then(r => r.json())
      .then(d => {
        const keysData = d.data ?? d
        if (keysData && typeof keysData === 'object') {
          setKeys(prev => {
            const next = { ...prev }
            for (const [type, info] of Object.entries(keysData) as [KeyType, { value: string }][]) {
              if (next[type]) {
                next[type] = { ...next[type], saved: info.value, value: '' }
              }
            }
            return next
          })
        }
      })
      .finally(() => setLoading(false))

    fetchAccounts()

    // Gemini 모델 로드
    fetch('/api/music-gen/settings')
      .then(r => r.json())
      .then(d => {
        const settings = Array.isArray(d) ? d : (d.data ?? [])
        const modelSetting = settings.find((s: { key: string }) => s.key === 'gemini_model')
        if (modelSetting) setGeminiModel(modelSetting.value)
      })
      .catch(() => {})
  }, [])

  async function fetchAccounts() {
    setAccountsLoading(true)
    try {
      const res = await fetch('/api/music-gen/settings/gemini-accounts')
      const d = await res.json()
      const list = Array.isArray(d) ? d : (Array.isArray(d.data) ? d.data : [])
      setAccounts(list)
    } catch { /* ignore */ }
    finally { setAccountsLoading(false) }
  }

  async function handleSave(keyType: KeyType) {
    const current = keys[keyType]
    if (!current.value.trim()) return
    setKeys(prev => ({ ...prev, [keyType]: { ...prev[keyType], saving: true, message: '' } }))
    try {
      const res = await fetch('/api/music-gen/settings/keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_type: keyType, key_value: current.value.trim() }),
      })
      if (res.ok) {
        setKeys(prev => ({
          ...prev,
          [keyType]: { ...prev[keyType], saved: current.value.trim(), value: '', message: '저장됨' },
        }))
        setTimeout(() => setKeys(prev => ({ ...prev, [keyType]: { ...prev[keyType], message: '' } })), 2000)
      } else {
        setKeys(prev => ({ ...prev, [keyType]: { ...prev[keyType], message: '저장 실패' } }))
      }
    } finally {
      setKeys(prev => ({ ...prev, [keyType]: { ...prev[keyType], saving: false } }))
    }
  }

  async function handleModelChange(model: string) {
    setGeminiModel(model)
    setModelSaving(true)
    try {
      await fetch('/api/music-gen/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gemini_model', value: model }),
      })
    } catch { /* ignore */ }
    finally { setModelSaving(false) }
  }

  async function handleAddAccount() {
    setAddError('')
    if (!newAccount.name.trim() || !newAccount.api_key.trim()) {
      setAddError('이름과 API 키는 필수입니다.')
      return
    }
    if (newAccount.type === 'vertex-ai-apikey' && !newAccount.project.trim()) {
      setAddError('Vertex AI 타입은 프로젝트 ID가 필수입니다.')
      return
    }
    setAddSaving(true)
    try {
      const res = await fetch('/api/music-gen/settings/gemini-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccount.name.trim(),
          type: newAccount.type,
          api_key: newAccount.api_key.trim(),
          project: newAccount.type === 'vertex-ai-apikey' ? newAccount.project.trim() : undefined,
          location: newAccount.type === 'vertex-ai-apikey' ? newAccount.location.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error?.message ?? '추가 실패')
        return
      }
      setNewAccount({ name: '', type: 'gemini-api', api_key: '', project: '', location: 'us-central1' })
      setShowAddForm(false)
      await fetchAccounts()
    } catch {
      setAddError('네트워크 오류')
    } finally {
      setAddSaving(false)
    }
  }

  async function handleDeleteAccount(id: number) {
    if (!confirm('이 키를 삭제하시겠습니까?')) return
    await fetch(`/api/music-gen/settings/gemini-accounts?id=${id}`, { method: 'DELETE' })
    await fetchAccounts()
  }

  async function handleToggleActive(account: GeminiAccount) {
    await fetch('/api/music-gen/settings/gemini-accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: account.id, is_active: !account.is_active }),
    })
    await fetchAccounts()
  }

  async function handleSaveName(account: GeminiAccount) {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === account.name) {
      setEditingId(null)
      return
    }
    await fetch('/api/music-gen/settings/gemini-accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: account.id, name: trimmed }),
    })
    setEditingId(null)
    await fetchAccounts()
  }

  async function handleMovePriority(account: GeminiAccount, direction: 'up' | 'down') {
    const sorted = [...accounts].sort((a, b) => a.priority - b.priority)
    const idx = sorted.findIndex(a => a.id === account.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const other = sorted[swapIdx]
    await Promise.all([
      fetch('/api/music-gen/settings/gemini-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, priority: other.priority }),
      }),
      fetch('/api/music-gen/settings/gemini-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: other.id, priority: account.priority }),
      }),
    ])
    await fetchAccounts()
  }

  if (loading) return <div className="text-sm text-muted-foreground">로딩 중...</div>

  return (
    <div className="w-full max-w-lg space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">나의 키관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          서비스 연동에 필요한 API 키를 개인별로 관리합니다.
        </p>
      </div>

      {/* ── Gemini 계정 그룹 ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Gemini 계정</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              우선순위 순서로 사용되며, rate limit 시 다음 키로 자동 전환됩니다.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? '취소' : '+ 추가'}
          </Button>
        </div>

        {/* 추가 폼 */}
        {showAddForm && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-accent/30">
            {addError && (
              <p className="text-xs text-red-500">{addError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">이름</Label>
                <Input
                  value={newAccount.name}
                  onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))}
                  placeholder="예: main-key"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">타입</Label>
                <select
                  value={newAccount.type}
                  onChange={e => setNewAccount(p => ({ ...p, type: e.target.value as GeminiAccountType }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="gemini-api">Gemini API (AIza...)</option>
                  <option value="vertex-ai-apikey">Vertex AI Express (AQ.Ab...)</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                value={newAccount.api_key}
                onChange={e => setNewAccount(p => ({ ...p, api_key: e.target.value }))}
                placeholder={newAccount.type === 'vertex-ai-apikey' ? 'AQ.Ab...' : 'AIza...'}
                className="mt-1 font-mono"
              />
            </div>

            {newAccount.type === 'vertex-ai-apikey' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">프로젝트 ID</Label>
                  <Input
                    value={newAccount.project}
                    onChange={e => setNewAccount(p => ({ ...p, project: e.target.value }))}
                    placeholder="my-project-id"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">리전</Label>
                  <Input
                    value={newAccount.location}
                    onChange={e => setNewAccount(p => ({ ...p, location: e.target.value }))}
                    placeholder="us-central1"
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <Button onClick={handleAddAccount} disabled={addSaving} size="sm">
              {addSaving ? '추가 중...' : '키 추가'}
            </Button>
          </div>
        )}

        {/* 계정 목록 */}
        {accountsLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-14 bg-accent rounded-lg animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground">등록된 Gemini 키가 없습니다.</p>
            <p className="text-xs text-muted-foreground mt-1">GEMINI_API_KEY 환경변수가 폴백으로 사용됩니다.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {accounts.map((account, idx) => (
              <div
                key={account.id}
                className={`flex items-center gap-3 border rounded-lg px-4 py-3 transition-colors ${
                  account.is_active
                    ? 'border-border bg-background'
                    : 'border-border bg-accent/50 opacity-60'
                }`}
              >
                {/* 우선순위 번호 */}
                <span className="text-xs font-mono text-muted-foreground w-5 text-center flex-shrink-0">
                  #{idx + 1}
                </span>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {editingId === account.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onBlur={() => handleSaveName(account)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveName(account)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="text-sm font-medium text-foreground bg-transparent border-b border-foreground/30 outline-none px-0 py-0 w-32"
                      />
                    ) : (
                      <span
                        className="text-sm font-medium text-foreground truncate cursor-pointer hover:underline"
                        onClick={() => { setEditingId(account.id); setEditingName(account.name) }}
                        title="클릭하여 이름 변경"
                      >
                        {account.name}
                      </span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      account.type === 'vertex-ai-apikey'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {account.type === 'vertex-ai-apikey' ? 'Vertex AI' : 'Gemini'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{account.api_key}</p>
                </div>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleMovePriority(account, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="우선순위 올리기"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMovePriority(account, 'down')}
                    disabled={idx === accounts.length - 1}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="우선순위 내리기"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleToggleActive(account)}
                    className={`p-1 transition-colors ${
                      account.is_active
                        ? 'text-green-500 hover:text-green-600'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={account.is_active ? '비활성화' : '활성화'}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      {account.is_active ? (
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <circle cx="12" cy="12" r="9" />
                      )}
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(account.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                    title="삭제"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* ── Gemini 모델 설정 ── */}
      <div className="border border-border rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">사용 모델</Label>
            <p className="text-xs text-muted-foreground mt-0.5">가사 생성에 사용할 Gemini 모델</p>
          </div>
          {modelSaving && <span className="text-xs text-muted-foreground">저장 중...</span>}
        </div>
        <select
          value={geminiModel}
          onChange={e => handleModelChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {!geminiModel && <option value="">모델을 선택하세요</option>}
          {GEMINI_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── 기타 API 키 (그룹별) ── */}
      {KEY_GROUPS.map(group => (
      <div key={group.title} className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">{group.title}</h2>
        {group.keys.map(({ type, label, placeholder, hint }) => {
          const state = keys[type]
          return (
            <div key={type} className={`bg-background border rounded-lg p-5 space-y-3 ${
              state.saved ? 'border-border' : 'border-dashed border-border/60'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="block text-sm font-medium text-foreground mb-0.5">{label}</Label>
                  {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                </div>
                {state.saved ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex-shrink-0">
                    등록됨
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-accent text-muted-foreground flex-shrink-0">
                    미등록
                  </span>
                )}
              </div>

              {state.saved && !state.value && (
                <div className="text-xs font-mono bg-accent px-3 py-1.5 rounded text-foreground">
                  {maskValue(state.saved)}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  type="password"
                  value={state.value}
                  onChange={e => setKeys(prev => ({ ...prev, [type]: { ...prev[type], value: e.target.value } }))}
                  placeholder={state.saved ? '변경하려면 새 값 입력' : placeholder}
                  className="font-mono flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave(type)}
                  disabled={state.saving || !state.value.trim()}
                >
                  {state.saving ? '...' : state.message || '저장'}
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
