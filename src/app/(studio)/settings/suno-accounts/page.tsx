'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSunoAccount } from '@/components/SunoAccountProvider'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type BrowserLoginStatus = 'idle' | 'connecting' | 'pending' | 'logged_in' | 'timeout' | 'error'

export default function SunoAccountsSettingsPage() {
  const { accounts, selectedAccount, setSelectedAccount, refresh } = useSunoAccount()
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ label: '', cookie: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')

  // 브라우저 로그인 상태
  const [browserLoginOpen, setBrowserLoginOpen] = useState(false)
  const [browserLiveUrl, setBrowserLiveUrl] = useState<string | null>(null)
  const [browserStatus, setBrowserStatus] = useState<BrowserLoginStatus>('idle')
  const [browserMessage, setBrowserMessage] = useState('')
  const sessionIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanupBrowserSession = useCallback(async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    if (sessionIdRef.current) {
      await fetch(`/api/music-gen/suno-accounts/browser-login/${sessionIdRef.current}`, { method: 'DELETE' }).catch(() => {})
      sessionIdRef.current = null
    }
    setBrowserLiveUrl(null)
    setBrowserStatus('idle')
    setBrowserMessage('')
  }, [])

  // 페이지 이탈/탭 닫기/컴포넌트 언마운트 시 세션 정리
  useEffect(() => {
    const cleanup = () => {
      if (sessionIdRef.current) {
        fetch(`/api/music-gen/suno-accounts/browser-login/${sessionIdRef.current}`, {
          method: 'DELETE',
          keepalive: true,
        }).catch(() => {})
      }
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    window.addEventListener('beforeunload', cleanup)
    return () => {
      window.removeEventListener('beforeunload', cleanup)
      cleanup()
    }
  }, [])

  async function handleBrowserLogin() {
    setBrowserLoginOpen(true)
    setBrowserStatus('connecting')
    setBrowserMessage('브라우저에 연결 중...')

    try {
      const res = await fetch('/api/music-gen/suno-accounts/browser-login', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '브라우저 세션 생성 실패')

      const { sessionId, liveUrl } = data.data ?? data
      sessionIdRef.current = sessionId
      setBrowserLiveUrl(liveUrl)
      setBrowserStatus('pending')
      setBrowserMessage('Suno에 로그인하세요 (Google, Discord 등)')

      // 2초 간격 쿠키 폴링
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/music-gen/suno-accounts/browser-login/${sessionId}`)
          const pollData = await pollRes.json()
          const status = pollData.data?.status ?? pollData.status

          if (status === 'logged_in') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
            if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
            const isNew = pollData.data?.isNew ?? pollData.isNew
            setBrowserStatus('logged_in')
            setBrowserMessage(isNew ? '로그인 완료! 새 계정이 등록되었습니다.' : '이미 등록된 계정입니다.')
            refresh()
            setTimeout(() => {
              setBrowserLoginOpen(false)
              cleanupBrowserSession()
            }, 2000)
          }
        } catch {
          // 폴링 에러는 무시
        }
      }, 2000)

      // 5분 타임아웃
      timeoutRef.current = setTimeout(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setBrowserStatus('timeout')
        setBrowserMessage('10분 타임아웃 — 세션이 만료되었습니다. 다시 시도하세요.')
        fetch(`/api/music-gen/suno-accounts/browser-login/${sessionId}`, { method: 'DELETE' }).catch(() => {})
      }, 10 * 60 * 1000)
    } catch (e) {
      setBrowserStatus('error')
      setBrowserMessage(e instanceof Error ? e.message : '브라우저 연결 실패')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (!form.label.trim()) { setAddError('라벨을 입력하세요'); return }
    if (!form.cookie.trim()) { setAddError('Suno 쿠키를 입력하세요'); return }
    setAdding(true)
    try {
      const res = await fetch('/api/music-gen/suno-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: form.label, cookie: form.cookie }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '추가 실패')
      setShowAddForm(false)
      setForm({ label: '', cookie: '' })
      refresh()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setAdding(false)
    }
  }

  async function handleToggleActive(id: number, currentActive: boolean) {
    await fetch(`/api/music-gen/suno-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentActive }),
    })
    refresh()
  }

  async function handleRename(id: number) {
    if (!editLabel.trim()) return
    await fetch(`/api/music-gen/suno-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel.trim() }),
    })
    setEditingId(null)
    setEditLabel('')
    refresh()
  }

  function handleDelete(id: number) {
    setConfirmDeleteId(id)
  }

  async function confirmDelete() {
    if (confirmDeleteId === null) return
    const id = confirmDeleteId
    setConfirmDeleteId(null)
    setDeleting(id)
    try {
      const res = await fetch(`/api/music-gen/suno-accounts/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '삭제 실패')
      refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
    <AlertDialog open={confirmDeleteId !== null} onOpenChange={open => { if (!open) setConfirmDeleteId(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Suno 계정 삭제</AlertDialogTitle>
          <AlertDialogDescription>이 Suno 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600 text-white">삭제</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="w-full max-w-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Suno 계정 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">브라우저 로그인 또는 쿠키 직접 입력으로 계정을 추가하세요.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleBrowserLogin}
            disabled={browserLoginOpen}
          >
            브라우저로 로그인
          </Button>
          <Button
            onClick={() => setShowAddForm(v => !v)}
          >
            + 쿠키 직접 입력
          </Button>
        </div>
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <div className="bg-background border border-border rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">새 Suno 계정</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            {addError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">{addError}</div>
            )}
            <div>
              <Label className="block text-xs font-medium text-foreground mb-1">라벨 (예: nicejames@gmail.com)</Label>
              <Input
                type="text"
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder="계정 식별용 이름"
                required
              />
            </div>
            <div>
              <Label className="block text-xs font-medium text-foreground mb-1">Suno 쿠키</Label>
              <Textarea
                value={form.cookie}
                onChange={e => setForm(p => ({ ...p, cookie: e.target.value }))}
                placeholder="Suno 브라우저 쿠키를 붙여넣으세요..."
                required
                rows={4}
                className="font-mono resize-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1">크롬 DevTools → Application → Cookies → suno.com 에서 복사</p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={adding}>
                {adding ? '추가 중...' : '추가'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                취소
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 계정 목록 */}
      <div className="space-y-2">
        {accounts.length === 0 && (
          <div className="bg-background border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
            등록된 Suno 계정이 없습니다.
          </div>
        )}
        {accounts.map(acct => (
          <div
            key={acct.id}
            className={`bg-background border rounded-lg p-4 shadow-sm flex items-center gap-3 transition-colors ${
              selectedAccount?.id === acct.id
                ? 'border-foreground/40 dark:border-foreground/40'
                : 'border-border'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${acct.is_active ? 'bg-green-400' : 'bg-background'}`}
              title={acct.is_active ? '활성' : '비활성'}
            />
            <div className="flex-1 min-w-0">
              {editingId === acct.id ? (
                <form onSubmit={e => { e.preventDefault(); handleRename(acct.id) }} className="flex items-center gap-1.5">
                  <Input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    className="h-7 text-sm"
                    autoFocus
                    onBlur={() => handleRename(acct.id)}
                    onKeyDown={e => { if (e.key === 'Escape') { setEditingId(null); setEditLabel('') } }}
                  />
                </form>
              ) : (
                <p
                  className="text-sm font-medium text-foreground truncate cursor-pointer hover:underline"
                  onClick={() => { setEditingId(acct.id); setEditLabel(acct.label) }}
                  title="클릭하여 이름 변경"
                >
                  {acct.label}
                </p>
              )}
              {selectedAccount?.id === acct.id && (
                <p className="text-[11px] text-muted-foreground mt-0.5">현재 선택됨</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedAccount(acct)}
                disabled={selectedAccount?.id === acct.id}
                className="text-xs px-2.5 py-1 h-auto"
              >
                선택
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleActive(acct.id, acct.is_active)}
                className="text-xs px-2.5 py-1 h-auto"
              >
                {acct.is_active ? '비활성' : '활성화'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(acct.id)}
                disabled={deleting === acct.id}
                className="text-xs px-2.5 py-1 h-auto"
              >
                삭제
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* 브라우저 로그인 Dialog */}
    <Dialog
      open={browserLoginOpen}
      onOpenChange={open => {
        if (!open) {
          cleanupBrowserSession()
          setBrowserLoginOpen(false)
        }
      }}
    >
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Suno 브라우저 로그인</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              <p>아래 브라우저에서 Suno에 로그인하세요. 로그인이 감지되면 쿠키가 자동으로 저장됩니다.</p>
              <p className="text-amber-600 dark:text-amber-400 font-medium">Discord 또는 Phone 로그인을 권장합니다. Google 로그인은 새 기기 보안 정책으로 차단될 수 있습니다.</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 px-6 pb-2 min-h-0">
          {browserLiveUrl && browserStatus === 'pending' ? (
            <iframe
              src={browserLiveUrl}
              className="w-full h-full rounded-md border border-border"
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center rounded-md border border-dashed border-border">
              {browserStatus === 'connecting' && (
                <div className="text-center text-muted-foreground">
                  <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm">브라우저에 연결 중...</p>
                </div>
              )}
              {browserStatus === 'logged_in' && (
                <div className="text-center text-green-600 dark:text-green-400">
                  <p className="text-lg font-medium mb-1">로그인 완료</p>
                  <p className="text-sm">계정이 자동으로 등록되었습니다.</p>
                </div>
              )}
              {browserStatus === 'timeout' && (
                <div className="text-center text-amber-600 dark:text-amber-400">
                  <p className="text-sm font-medium mb-1">세션 만료</p>
                  <p className="text-xs">5분 타임아웃 — 다시 시도하세요.</p>
                </div>
              )}
              {browserStatus === 'error' && (
                <div className="text-center text-red-600 dark:text-red-400">
                  <p className="text-sm font-medium mb-1">연결 실패</p>
                  <p className="text-xs">{browserMessage}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-4 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              browserStatus === 'connecting' ? 'bg-amber-400 animate-pulse' :
              browserStatus === 'pending' ? 'bg-blue-400 animate-pulse' :
              browserStatus === 'logged_in' ? 'bg-green-400' :
              'bg-red-400'
            }`} />
            <span className="text-xs text-muted-foreground">{browserMessage}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cleanupBrowserSession()
              setBrowserLoginOpen(false)
            }}
          >
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
