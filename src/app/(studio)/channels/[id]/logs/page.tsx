'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Session {
  id: string
  title: string | null
  status: string
  summary: string | null
  message_count: number
  created_at: number
  updated_at: number
}

interface Message {
  id: string
  session_id: string
  role: string
  content: string
  token_count: number
  created_at: number
}

function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const STATUS_LABELS: Record<string, string> = {
  active:    '활성',
  archived:  '아카이브',
  completed: '완료',
}

const STATUS_COLOR: Record<string, string> = {
  active:    'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  archived:  'bg-accent text-muted-foreground',
  completed: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
}

export default function ChannelLogsPage() {
  const { id } = useParams<{ id: string }>()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [loadingMessages, setLoadingMessages] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch(`/api/music-gen/channels/${id}/sessions`)
      .then(r => r.json())
      .then(d => setSessions(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  async function toggleSession(sessionId: string) {
    if (expandedId === sessionId) {
      setExpandedId(null)
      return
    }
    setExpandedId(sessionId)
    if (messages[sessionId]) return
    setLoadingMessages(prev => ({ ...prev, [sessionId]: true }))
    try {
      const res = await fetch(`/api/music-gen/sessions/${sessionId}/messages`)
      const d = await res.json()
      setMessages(prev => ({ ...prev, [sessionId]: Array.isArray(d) ? d : (d.messages ?? d.data ?? []) }))
    } catch {
      setMessages(prev => ({ ...prev, [sessionId]: [] }))
    } finally {
      setLoadingMessages(prev => ({ ...prev, [sessionId]: false }))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href={`/channels/${id}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← 채널
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-semibold text-foreground">대화 로그</h1>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-accent rounded-lg animate-pulse" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <p>대화 세션이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <div key={session.id} className="bg-background border border-border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                onClick={() => toggleSession(session.id)}
              >
                <svg
                  className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expandedId === session.id ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {session.title ?? `세션 ${session.id.slice(0, 8)}`}
                  </p>
                  {session.summary && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{session.summary}</p>
                  )}
                </div>

                <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                  {session.message_count}개
                </span>

                <span className={`flex-shrink-0 px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLOR[session.status] ?? STATUS_COLOR.archived}`}>
                  {STATUS_LABELS[session.status] ?? session.status}
                </span>

                <span className="hidden sm:block flex-shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {formatDate(session.updated_at)}
                </span>
              </button>

              {expandedId === session.id && (
                <div className="border-t border-border px-4 py-3 space-y-2 max-h-96 overflow-y-auto bg-accent/30">
                  {loadingMessages[session.id] ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      메시지 로딩 중...
                    </div>
                  ) : (messages[session.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4">메시지가 없습니다.</p>
                  ) : (
                    (messages[session.id] ?? []).map(msg => (
                      <div key={msg.id} className={`text-xs rounded-lg px-3 py-2 ${msg.role === 'user' ? 'bg-primary/10 ml-6' : 'bg-background border border-border mr-6'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-medium ${msg.role === 'user' ? 'text-primary' : 'text-muted-foreground'}`}>
                            {msg.role === 'user' ? '사용자' : msg.role === 'assistant' ? 'AI' : msg.role}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{formatDate(msg.created_at)}</span>
                        </div>
                        <p className="text-foreground whitespace-pre-wrap line-clamp-5">{msg.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
