'use client'

import { useState, useEffect } from 'react'

export default function TelegramSettingsPage() {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // 환경변수 상태 조회 (실제로는 /api/settings에서 가져옴)
    const token = localStorage.getItem('telegram_chat_id') ?? ''
    setChatId(token)
  }, [])

  async function handleTest() {
    if (!chatId) return
    try {
      await fetch('/api/music-gen/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'telegram.send',
          payload: {
            chat_id: chatId,
            text: '✅ Suno Studio 텔레그램 연결 테스트 성공!',
          },
        }),
      })
      alert('테스트 메시지가 전송되었습니다. 잠시 후 확인하세요.')
    } catch (e) {
      alert('전송 실패: ' + String(e))
    }
  }

  function handleSave() {
    localStorage.setItem('telegram_chat_id', chatId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold">텔레그램 설정</h1>

      <div className="p-4 bg-gray-900 rounded-xl border border-gray-800 space-y-2">
        <p className="text-sm font-medium text-white">봇 토큰 설정</p>
        <p className="text-xs text-gray-400">
          서버 .env 파일에 <code className="text-blue-400">TELEGRAM_BOT_TOKEN</code>을 설정하세요.
        </p>
        <p className="text-xs text-gray-500">
          봇 없으면: @BotFather에서 /newbot 명령으로 생성
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-2">내 Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="예: 123456789"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            @userinfobot에게 메시지 보내면 Chat ID 확인 가능
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saved ? '저장됨 ✓' : '저장'}
          </button>
          <button
            onClick={handleTest}
            disabled={!chatId}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            테스트 전송
          </button>
        </div>
      </div>

      <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
        <p className="text-sm font-medium text-white mb-2">지원 명령어</p>
        <div className="space-y-1 font-mono text-xs text-gray-400">
          <p>/new &lt;youtube_url&gt; — 새 작업 시작</p>
          <p>/list — 최근 워크스페이스 목록</p>
          <p>/status — 파이프라인 상태</p>
          <p>/approve &lt;session_id&gt; — 결재 승인</p>
        </div>
      </div>
    </div>
  )
}
