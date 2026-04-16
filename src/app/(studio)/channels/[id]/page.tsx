'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChannel } from '@/components/ChannelProvider';

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

interface YoutubeVideo {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number;
  publishedAt: string;
  url: string;
}

interface BackImage {
  id: number;
  channel_id: number;
  r2_key: string;
  filename: string;
  is_cover: number;
  display_order: number;
  created_at: number;
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
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { channels, selectedChannel, setSelectedChannel } = useChannel();

  // URL의 채널 ID → 헤더 드롭다운 동기화 (직접 URL 접근 시)
  useEffect(() => {
    if (!channels.length) return;
    const matched = channels.find(c => String(c.id) === id);
    if (matched && String(selectedChannel?.id) !== id) {
      setSelectedChannel(matched);
    }
  }, [id, channels, selectedChannel, setSelectedChannel]);

  // 헤더 채널 드롭다운이 바뀌면 해당 채널 페이지로 이동
  useEffect(() => {
    if (selectedChannel && String(selectedChannel.id) !== id) {
      router.replace(`/channels/${selectedChannel.id}`);
    }
  }, [selectedChannel, id, router]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'about' | 'prompt' | 'sessions' | 'backimages'>('about');
  const [youtubeInfo, setYoutubeInfo] = useState<YoutubeInfo | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [backImages, setBackImages] = useState<BackImage[]>([]);
  const [backImagesLoading, setBackImagesLoading] = useState(false);
  const [backImageUploading, setBackImageUploading] = useState(false);
  const backImageInputRef = useRef<HTMLInputElement>(null);

  const fetchChannel = useCallback(async () => {
    const res = await fetch(`/api/music-gen/channels/${id}`);
    if (res.ok) {
      const data = await res.json();
      const ch = data.data ?? data;
      setChannel(ch);
      setPrompt(ch.system_prompt ?? '');
    }
  }, [id]);

  const fetchSessions = useCallback(async () => {
    const res = await fetch(`/api/music-gen/sessions?channel_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : (data.data ?? []));
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

  const fetchBackImages = useCallback(async () => {
    setBackImagesLoading(true);
    try {
      const res = await fetch(`/api/music-gen/back-images?channel_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setBackImages(data.data ?? data);
      }
    } finally {
      setBackImagesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchChannel();
    fetchSessions();
    fetchYoutubeInfo();
    fetchBackImages();
  }, [fetchChannel, fetchSessions, fetchYoutubeInfo, fetchBackImages]);

  const handleBackImageUpload = async (file: File, imageType: 'video' | 'thumbnail') => {
    setBackImageUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('channel_id', id);
      fd.append('image_type', imageType);
      const res = await fetch('/api/music-gen/back-images', { method: 'POST', body: fd });
      if (res.ok) await fetchBackImages();
    } finally {
      setBackImageUploading(false);
    }
  };

  const handleSetCover = async (imageId: number) => {
    await fetch(`/api/music-gen/back-images/${imageId}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: Number(id) }),
    });
    await fetchBackImages();
  };

  const handleDeleteBackImage = async (imageId: number) => {
    await fetch(`/api/music-gen/back-images/${imageId}`, { method: 'DELETE' });
    await fetchBackImages();
  };

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
      <div className="px-6 pt-6 mb-4">
        <h1 className="text-xl font-semibold text-foreground">{channel.channel_name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{channel.youtube_channel_id}</p>
      </div>

      <div className="flex gap-2 mb-0 border-b border-border px-6">
        {(['about', 'prompt', 'sessions', 'backimages'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'about' ? '소개' : tab === 'prompt' ? '시스템 프롬프트' : tab === 'sessions' ? '대화 이력' : '배경이미지'}
          </button>
        ))}
      </div>

      {activeTab === 'about' && (
        <div className="flex-1 overflow-auto p-4 space-y-4">
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
              <button
                onClick={fetchYoutubeInfo}
                className="mt-3 px-3 py-1.5 text-sm border border-border rounded-md hover:border-foreground/40 transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'prompt' && (
        <div className="flex flex-col flex-1 p-4 gap-3 min-h-0">
          <h2 className="text-base font-semibold text-foreground flex-shrink-0">채널별 Gemini 시스템 프롬프트</h2>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Gemini에게 전달할 채널 전용 시스템 프롬프트를 입력하세요..."
            className="flex-1 w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-foreground text-sm font-mono resize-none"
          />
          {error && <p className="text-red-500 dark:text-red-400 text-sm flex-shrink-0">{error}</p>}
          <div className="flex items-center justify-between flex-shrink-0">
            <span className="text-sm text-muted-foreground">{prompt.length.toLocaleString()} 자</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md transition-colors"
            >
              {saving ? '저장 중...' : saved ? '✓ 저장됨' : '저장'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="bg-background border border-border rounded-lg shadow-sm p-5">
          <h2 className="text-xl font-semibold text-foreground mb-4">대화 이력 ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">대화 이력이 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {sessions.map(session => (
                <div key={session.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">{session.title ?? '(제목 없음)'}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(session.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    session.status === 'active'
                      ? 'bg-accent dark:bg-accent text-foreground'
                      : 'bg-accent text-muted-foreground'
                  }`}>
                    {session.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'backimages' && (
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* 업로드 버튼 */}
          <div className="flex items-center gap-2">
            <input
              ref={backImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                await handleBackImageUpload(file, 'video');
                e.target.value = '';
              }}
            />
            <button
              onClick={() => backImageInputRef.current?.click()}
              disabled={backImageUploading}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:border-foreground/40 disabled:opacity-50 transition-colors"
            >
              {backImageUploading ? '업로드 중...' : '이미지 추가'}
            </button>
            <span className="text-xs text-muted-foreground">
              {backImages.length}개 · 커버(대표 이미지)로 설정한 이미지가 YouTube 썸네일 배경으로 사용됩니다.
            </span>
          </div>

          {/* 이미지 목록 */}
          {backImagesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-video bg-accent rounded-lg animate-pulse" />
              ))}
            </div>
          ) : backImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-lg text-muted-foreground">
              <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 15l5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              </svg>
              <p className="text-sm">배경이미지가 없습니다.</p>
              <p className="text-xs mt-1">이미지 추가 버튼으로 업로드하세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {backImages.map(img => (
                <div
                  key={img.id}
                  className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                    img.is_cover ? 'border-primary' : 'border-border'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/r2/object/${img.r2_key}`}
                    alt={img.filename}
                    className="w-full aspect-video object-cover"
                  />

                  {/* 커버 배지 */}
                  {img.is_cover === 1 && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary text-primary-foreground">
                      커버
                    </span>
                  )}

                  {/* 호버 오버레이 */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {img.is_cover !== 1 && (
                      <button
                        onClick={() => handleSetCover(img.id)}
                        className="px-2 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        커버 설정
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteBackImage(img.id)}
                      className="px-2 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
