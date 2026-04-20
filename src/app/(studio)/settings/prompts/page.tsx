'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type TabKey = 'midi' | 'background' | 'lyrics';

const TABS: { key: TabKey; label: string; settingKey: string; description: string }[] = [
  {
    key: 'midi',
    label: 'MIDI분석 프롬프트',
    settingKey: 'music_analysis_system_prompt',
    description: 'Gemini가 MIDI 구조를 분석할 때 사용하는 시스템 프롬프트입니다. 비워두면 내장 기본 프롬프트가 사용됩니다.',
  },
  {
    key: 'background',
    label: '배경음 분석 프롬프트',
    settingKey: 'background_analysis_system_prompt',
    description: 'Gemini가 배경음(MR/반주)을 분석할 때 사용하는 시스템 프롬프트입니다. 비워두면 내장 기본 프롬프트가 사용됩니다.',
  },
  {
    key: 'lyrics',
    label: '음원가사 프롬프트',
    settingKey: 'music_lyrics_system_prompt',
    description:
      '채널 스타일과 무관하게, 원곡 자체의 스타일로 가사와 Suno 스타일을 생성할 때 사용하는 공통 프롬프트입니다.',
  },
];

function PromptEditor({ settingKey, description }: { settingKey: string; description: string }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue('');
    fetch(`/api/music-gen/settings/${settingKey}`)
      .then(r => r.json())
      .then(data => { if (data?.value) setValue(data.value); })
      .catch(() => {});
  }, [settingKey]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/music-gen/settings/${settingKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? '저장 실패');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 pt-4 gap-3">
      <p className="text-sm text-muted-foreground flex-shrink-0">{description}</p>
      <Textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="프롬프트를 입력하세요..."
        className="flex-1 min-h-0 w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-sm font-mono resize-none"
      />
      {error && <p className="text-destructive text-sm flex-shrink-0">{error}</p>}
      <div className="flex items-center justify-between flex-shrink-0 pb-4">
        <span className="text-sm text-muted-foreground">{value.length.toLocaleString()} 자</span>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md transition-opacity"
        >
          {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
        </Button>
      </div>
    </div>
  );
}

export default function SystemPromptsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('midi');
  const current = TABS.find(t => t.key === activeTab)!;

  return (
    <div className="flex-1 flex flex-col min-h-0 pb-0">
      <div className="pt-2 mb-4">
        <h1 className="text-xl font-semibold text-foreground">시스템 프롬프트 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          채널별 가사 프롬프트와 별개로, 모든 채널에 공통 적용되는 시스템 프롬프트를 관리합니다.
        </p>
      </div>

      <div className="flex gap-2 mb-0 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <Button
            key={tab.key}
            variant="ghost"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 rounded-none transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-foreground bg-transparent hover:bg-transparent'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-transparent'
            }`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <PromptEditor key={current.key} settingKey={current.settingKey} description={current.description} />
    </div>
  );
}
