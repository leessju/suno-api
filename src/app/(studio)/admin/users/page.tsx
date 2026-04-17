'use client'

import { useState, useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  created_at: string
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(async res => {
        if (res.status === 403) {
          setForbidden(true)
          return
        }
        if (!res.ok) throw new Error('유저 목록 로드 실패')
        const json = await res.json()
        setUsers(json.data ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : '오류가 발생했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleRoleChange(userId: string, role: string) {
    setUpdating(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error('역할 변경 실패')
      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, role } : u))
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : '역할 변경 중 오류가 발생했습니다.')
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        불러오는 중...
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        권한이 없습니다.
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500 dark:text-red-400 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-foreground mb-6">회원 권한 관리</h1>

      <div className="bg-background border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium text-foreground">
            전체 회원 목록 + 역할 변경
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/50">
                <th className="text-left px-5 py-3 font-medium text-foreground">이름</th>
                <th className="text-left px-5 py-3 font-medium text-foreground">이메일</th>
                <th className="text-left px-5 py-3 font-medium text-foreground">현재 역할</th>
                <th className="text-left px-5 py-3 font-medium text-foreground">역할 변경</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {users.map(u => {
                const isSelf = session?.user?.id === u.id
                return (
                  <tr key={u.id} className="hover:bg-accent dark:hover:bg-accent transition-colors">
                    <td className="px-5 py-3 text-foreground">{u.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-accent dark:bg-accent text-foreground'
                            : 'bg-accent text-muted-foreground'
                        }`}
                      >
                        {u.role === 'admin' ? '관리자' : '일반'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        value={u.role}
                        disabled={isSelf || updating === u.id}
                        onValueChange={role => handleRoleChange(u.id, role)}
                      >
                        <SelectTrigger className="px-2 py-1 bg-background border border-input rounded text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed w-auto h-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="common">일반</SelectItem>
                          <SelectItem value="admin">관리자</SelectItem>
                        </SelectContent>
                      </Select>
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">본인</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              등록된 회원이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
