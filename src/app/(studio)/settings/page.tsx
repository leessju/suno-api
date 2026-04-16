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
          payload: { chat_id: chatId, text: '✅ Suno Studio 텔레그램 연결 테스트 성공!' },
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
    <div className="space-y-6 w-full max-w-lg">
      <div className="bg-background border border-border rounded-lg p-5 space-y-2">
        <p className="text-sm font-medium text-foreground">봇 토큰 설정</p>
        <p className="text-sm text-muted-foreground">
          서버 .env 파일에{' '}
          <code className="font-mono text-foreground bg-accent px-1.5 py-0.5 rounded text-xs">
            TELEGRAM_BOT_TOKEN
          </code>
          을 설정하세요.
        </p>
        <p className="text-sm text-muted-foreground">봇 없으면: @BotFather에서 /newbot 명령으로 생성</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">내 Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="예: 123456789"
            className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-sm"
          />
          <p className="text-sm text-muted-foreground mt-1">@userinfobot에게 메시지 보내면 Chat ID 확인 가능</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-md transition-opacity"
          >
            {saved ? '저장됨 ✓' : '저장'}
          </button>
          <button
            onClick={handleTest}
            disabled={!chatId}
            className="flex-1 py-2 px-4 bg-background border border-border text-foreground text-sm font-medium rounded-md hover:bg-accent transition-colors disabled:opacity-50"
          >
            테스트 전송
          </button>
        </div>
      </div>

      <div className="bg-background border border-border rounded-lg p-5">
        <p className="text-sm font-medium text-foreground mb-2">지원 명령어</p>
        <div className="space-y-1 font-mono text-xs text-muted-foreground">
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
      .then(data => { if (data?.data?.value) setValue(data.data.value); })
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
    <div className="w-full bg-background border border-border rounded-lg p-5 space-y-4">
      <h2 className="text-lg font-semibold text-foreground">음악 분석 시스템 프롬프트</h2>
      <p className="text-sm text-muted-foreground">
        이 프롬프트는 채널에 관계없이 모든 음악 분석에 공통으로 사용됩니다.
      </p>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={16}
        placeholder="음악 분석에 사용할 공통 시스템 프롬프트를 입력하세요..."
        className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-sm font-mono resize-y"
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{value.length.toLocaleString()} 자</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md transition-opacity"
        >
          {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'telegram' | 'music-prompt'>('telegram');

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold text-foreground mb-6">설정</h1>

      <div className="flex gap-0 mb-6 border-b border-border">
        {(['telegram', 'music-prompt'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'telegram' ? '텔레그램 설정' : '음악 분석 프롬프트'}
          </button>
        ))}
      </div>

      {activeTab === 'telegram' && <TelegramTab />}
      {activeTab === 'music-prompt' && <MusicAnalysisPromptTab />}
    </div>
  );
}
