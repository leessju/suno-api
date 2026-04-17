'use client'

import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function SunoAccountsSettingsPage() {
  const { accounts, selectedAccount, setSelectedAccount, refresh } = useSunoAccount()
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ label: '', cookie: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

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
          <p className="text-sm text-muted-foreground mt-1">Suno 쿠키를 붙여넣어 계정을 추가하세요.</p>
        </div>
        <Button
          onClick={() => setShowAddForm(v => !v)}
        >
          + 계정 추가
        </Button>
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
              <p className="text-sm font-medium text-foreground truncate">{acct.label}</p>
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
    </>
  )
}
