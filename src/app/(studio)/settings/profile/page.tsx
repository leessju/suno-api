'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function ProfilePage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/user/profile')
      .then(r => r.json())
      .then(d => {
        setName(d.name ?? '')
        setEmail(d.email ?? '')
        const key = d.avatar_r2_key ?? null
        setAvatarKey(key)
        if (key) setAvatarUrl(`/api/r2/object/${key}?t=${Date.now()}`)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) setMessage('저장되었습니다.')
      else setMessage('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/user/avatar', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok && data.key) {
        const key = data.key as string
        const url = `/api/r2/object/${key}?t=${Date.now()}`
        setAvatarKey(key)
        setAvatarUrl(url)
        window.dispatchEvent(new CustomEvent('profileAvatarUpdated', { detail: url }))
      } else {
        setMessage(data.error?.message ?? '업로드 실패')
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteAvatar() {
    setDeleting(true)
    try {
      const res = await fetch('/api/user/avatar', { method: 'DELETE' })
      if (res.ok) {
        setAvatarKey(null)
        setAvatarUrl(null)
        window.dispatchEvent(new CustomEvent('profileAvatarUpdated', { detail: null }))
      } else {
        setMessage('아바타 삭제에 실패했습니다.')
      }
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">로딩 중...</div>

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">프로필 편집</h1>
        <p className="text-sm text-muted-foreground mt-1">이름과 아바타를 변경할 수 있습니다.</p>
      </div>

      <div className="bg-background border border-border rounded-lg shadow-sm p-6 space-y-5">
        {message && (
          <div className="p-3 bg-accent border border-border rounded-md text-foreground text-sm">
            {message}
          </div>
        )}

        {/* 아바타 */}
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full overflow-hidden bg-white dark:bg-neutral-200 border border-border flex-shrink-0">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="프로필" fill className="object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white dark:bg-neutral-200">
                <svg className="w-9 h-9 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? '업로드 중...' : '사진 변경'}
              </Button>
              {avatarKey && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAvatar}
                  disabled={deleting}
                >
                  {deleting ? '삭제 중...' : '삭제'}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP (최대 5MB)</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label className="block text-sm font-medium text-foreground mb-1.5">이름</Label>
            <Input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <Label className="block text-sm font-medium text-foreground mb-1.5">이메일</Label>
            <Input
              type="email"
              value={email}
              disabled
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="w-full"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </form>
      </div>
    </div>
  )
}
