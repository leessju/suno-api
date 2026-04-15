'use client';
import { useState, useEffect } from 'react';

function TelegramTab() {
  const [chatId, setChatId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('telegram_chat_id') ?? '';
    setChatId(token);
  }, []);

  async function handleTest() {
    if (!chatId) return;
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
      });
      alert('테스트 메시지가 전송되었습니다. 잠시 후 확인하세요.');
    } catch (e) {
      alert('전송 실패: ' + String(e));
    }
  }

  function handleSave() {
    localStorage.setItem('telegram_chat_id', chatId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-lg">
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
  );
}

function MusicAnalysisPromptTab() {
  const KEY = 'music_analysis_system_prompt';
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/music-gen/settings/${KEY}`)
      .then(r => r.json())
      .then(data => {
        if (data?.data?.value) setValue(data.data.value);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/music-gen/settings/${KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('저장 실패');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">음악 분석 시스템 프롬프트</h2>
      <p className="text-gray-400 text-sm">
        이 프롬프트는 채널에 관계없이 모든 음악 분석에 공통으로 사용됩니다.
      </p>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={16}
        placeholder="음악 분석에 사용할 공통 시스템 프롬프트를 입력하세요..."
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm resize-y"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
        </button>
        <span className="text-gray-400 text-sm">{value.length} 자</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'telegram' | 'music-prompt'>('telegram');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">설정</h1>

      <div className="flex gap-2 mb-6 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('telegram')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'telegram'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          텔레그램 설정
        </button>
        <button
          onClick={() => setActiveTab('music-prompt')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'music-prompt'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          음악 분석 프롬프트
        </button>
      </div>

      {activeTab === 'telegram' && <TelegramTab />}
      {activeTab === 'music-prompt' && <MusicAnalysisPromptTab />}
    </div>
  );
}
