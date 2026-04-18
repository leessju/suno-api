'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChannel } from '@/components/ChannelProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Channel {
  id: number;
  channel_name: string;
  youtube_channel_id: string;
  channel_handle: string | null;
  system_prompt: string;
  lyric_format: string;
}

interface YoutubeVideo {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number;
  publishedAt: string;
  url: string;
}

interface YoutubeInfo {
  source: 'api' | 'oembed' | 'local';
  title: string | null;
  description: string | null;
  customUrl: string | null;
  thumbnail: string | null;
  banner: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
  country: string | null;
  channelUrl: string;
  fullVideos: YoutubeVideo[];
  shortsVideos: YoutubeVideo[];
}

export default function ChannelDetailPage() {
  const { id: youtubeId } = useParams<{ id: string }>();
  const router = useRouter();
  const { channels, selectedChannel, setSelectedChannel } = useChannel();

  // youtube_channel_id로 채널 매칭 → 숫자 id를 API 호출에 사용
  const matchedChannel = channels.find(c => c.youtube_channel_id === youtubeId);
  const id = matchedChannel ? String(matchedChannel.id) : youtubeId;

  // URL의 youtube_id → 헤더 드롭다운 동기화 (직접 URL 접근 시)
  useEffect(() => {
    if (!channels.length) return;
    if (matchedChannel && selectedChannel?.id !== matchedChannel.id) {
      setSelectedChannel(matchedChannel);
    }
  }, [youtubeId, channels, matchedChannel, selectedChannel, setSelectedChannel]);

  // 헤더 채널 드롭다운이 바뀌면 해당 채널 페이지로 이동
  useEffect(() => {
    if (selectedChannel && selectedChannel.youtube_channel_id !== youtubeId) {
      router.replace(`/channels/${selectedChannel.youtube_channel_id}`);
    }
  }, [selectedChannel, youtubeId, router]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'about' | 'prompt'>('about');
  const [youtubeInfo, setYoutubeInfo] = useState<YoutubeInfo | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);

  const fetchChannel = useCallback(async () => {
    const res = await fetch(`/api/music-gen/channels/${id}`);
    if (res.ok) {
      const data = await res.json();
      const ch = data.data ?? data;
      setChannel(ch);
      setPrompt(ch.system_prompt ?? '');
    }
  }, [id]);

  const fetchYoutubeInfo = useCallback(async () => {
    setYoutubeLoading(true);
    try {
      const res = await fetch(`/api/music-gen/channels/${id}/youtube-info`);
      if (res.ok) {
        const data = await res.json();
        setYoutubeInfo(data.data ?? data);
      }
    } finally {
      setYoutubeLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchChannel();
    fetchYoutubeInfo();
  }, [fetchChannel, fetchYoutubeInfo]);

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
      await fetchChannel();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!channel) return <div className="p-6 text-sm text-muted-foreground">로딩 중...</div>;

  return (
    <div className="flex-1 flex flex-col min-h-0 pb-0">
      <div className="pt-2 mb-4">
        <h1 className="text-xl font-semibold text-foreground">{channel.channel_name}</h1>
        {channel.channel_handle && (
          <p className="text-sm text-muted-foreground mt-1">@{channel.channel_handle}</p>
        )}
      </div>

      <div className="flex gap-2 mb-0 border-b border-border overflow-x-auto">
        {(['about', 'prompt'] as const).map(tab => (
          <Button
            key={tab}
            variant="ghost"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 rounded-none transition-colors ${
              activeTab === tab
                ? 'border-primary text-foreground bg-transparent hover:bg-transparent'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-transparent'
            }`}
          >
            {tab === 'about' ? '소개' : '시스템 프롬프트'}
          </Button>
        ))}
      </div>

      {activeTab === 'about' && (
        <div className="flex-1 overflow-auto pt-4 space-y-4">
          {youtubeLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-accent rounded-lg animate-pulse" />
              ))}
            </div>
          ) : youtubeInfo ? (
            <>
              {/* 배너 */}
              {youtubeInfo.banner && (
                <div className="w-full rounded-lg overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={youtubeInfo.banner} alt="채널 배너" className="w-full object-cover max-h-40" />
                </div>
              )}

              {/* 프로필 + 기본 정보 */}
              <div className="flex items-start gap-4">
                {youtubeInfo.thumbnail && (
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-border flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={youtubeInfo.thumbnail} alt={youtubeInfo.title ?? '채널'} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-base">{youtubeInfo.title ?? channel.channel_name}</p>
                  {youtubeInfo.customUrl && (
                    <a
                      href={youtubeInfo.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {youtubeInfo.customUrl}
                    </a>
                  )}
                  {youtubeInfo.country && (
                    <p className="text-xs text-muted-foreground mt-0.5">{youtubeInfo.country}</p>
                  )}
                </div>
              </div>

              {/* 통계 */}
              {(youtubeInfo.subscriberCount != null || youtubeInfo.videoCount != null || youtubeInfo.viewCount != null) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {youtubeInfo.subscriberCount != null && (
                    <div className="bg-background border border-border rounded-lg p-3 text-center">
                      <p className="text-lg font-semibold text-foreground">
                        {youtubeInfo.subscriberCount >= 10000
                          ? `${(youtubeInfo.subscriberCount / 10000).toFixed(1)}만`
                          : youtubeInfo.subscriberCount.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">구독자</p>
                    </div>
                  )}
                  {youtubeInfo.viewCount != null && (
                    <div className="bg-background border border-border rounded-lg p-3 text-center">
                      <p className="text-lg font-semibold text-foreground">
                        {youtubeInfo.viewCount >= 100000000
                          ? `${(youtubeInfo.viewCount / 100000000).toFixed(1)}억`
                          : youtubeInfo.viewCount >= 10000
                          ? `${(youtubeInfo.viewCount / 10000).toFixed(0)}만`
                          : youtubeInfo.viewCount.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">조회수</p>
                    </div>
                  )}
                  {youtubeInfo.fullVideos.length > 0 && (
                    <div className="bg-background border border-border rounded-lg p-3 text-center">
                      <p className="text-lg font-semibold text-foreground">{youtubeInfo.fullVideos.length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">영상</p>
                    </div>
                  )}
                  {youtubeInfo.shortsVideos.length > 0 && (
                    <div className="bg-background border border-border rounded-lg p-3 text-center">
                      <p className="text-lg font-semibold text-foreground">{youtubeInfo.shortsVideos.length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">쇼츠</p>
                    </div>
                  )}
                </div>
              )}


              {/* 설명 */}
              {youtubeInfo.description && (
                <div className="bg-background border border-border rounded-lg p-4">
                  <p className="text-sm font-medium text-foreground mb-2">채널 설명</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {youtubeInfo.description}
                  </p>
                </div>
              )}

              {/* YouTube 링크 */}
              <div className="flex items-center gap-2">
                <a
                  href={youtubeInfo.channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground hover:border-foreground/40 transition-colors"
                >
                  <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  YouTube에서 보기
                </a>
                {youtubeInfo.source !== 'api' && (
                  <span className="text-xs text-muted-foreground">
                    (전체 정보: YOUTUBE_API_KEY 환경변수 설정 필요)
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">YouTube 채널 정보를 불러올 수 없습니다.</p>
              <Button
                variant="outline"
                onClick={fetchYoutubeInfo}
                className="mt-3 px-3 py-1.5 text-sm"
              >
                다시 시도
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'prompt' && (
        <div className="flex flex-col flex-1 pt-4 gap-3 min-h-0">
          <h2 className="text-base font-semibold text-foreground flex-shrink-0">채널별 Gemini 시스템 프롬프트</h2>
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Gemini에게 전달할 채널 전용 시스템 프롬프트를 입력하세요..."
            className="flex-1 w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-foreground text-sm font-mono resize-none"
          />
          {error && <p className="text-red-500 dark:text-red-400 text-sm flex-shrink-0">{error}</p>}
          <div className="flex items-center justify-between flex-shrink-0">
            <span className="text-sm text-muted-foreground">{prompt.length.toLocaleString()} 자</span>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md transition-colors"
            >
              {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
