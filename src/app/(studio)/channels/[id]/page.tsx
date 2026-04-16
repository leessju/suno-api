'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface Channel {
  id: number;
  channel_name: string;
  youtube_channel_id: string;
  system_prompt: string;
  lyric_format: string;
}

interface Session {
  id: string;
  title: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export default function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'prompt' | 'sessions'>('prompt');

  const fetchChannel = useCallback(async () => {
    const res = await fetch(`/api/music-gen/channels/${id}`);
    if (res.ok) {
      const data = await res.json();
      setChannel(data.data);
      setPrompt(data.data.system_prompt ?? '');
    }
  }, [id]);

  const fetchSessions = useCallback(async () => {
    const res = await fetch(`/api/music-gen/sessions?channel_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setSessions(data.data ?? []);
    }
  }, [id]);

  useEffect(() => {
    fetchChannel();
    fetchSessions();
  }, [fetchChannel, fetchSessions]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/music-gen/channels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: prompt }),
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

  if (!channel) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">로딩 중...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{channel.channel_name}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{channel.youtube_channel_id}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('prompt')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'prompt'
              ? 'border-b-2 border-brand text-brand'
              : 'border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          시스템 프롬프트
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'sessions'
              ? 'border-b-2 border-brand text-brand'
              : 'border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          대화 이력
        </button>
      </div>

      {activeTab === 'prompt' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-5 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">채널별 Gemini 시스템 프롬프트</h2>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={16}
            placeholder="Gemini에게 전달할 채널 전용 시스템 프롬프트를 입력하세요..."
            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand text-sm font-mono resize-y"
          />
          {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">{prompt.length} 자</span>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-5">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">대화 이력 ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">대화 이력이 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {sessions.map(session => (
                <div key={session.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{session.title ?? '(제목 없음)'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {new Date(session.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    session.status === 'active'
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    {session.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
