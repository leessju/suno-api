export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import * as channelsRepo from '@/lib/music-gen/repositories/channels';
import { ok, err, handleError } from '@/lib/music-gen/api-helpers';

type Params = { params: Promise<{ id: string }> };

/** Parse ISO 8601 duration (PT1M30S) → seconds */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

interface VideoItem {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number; // seconds
  publishedAt: string;
  url: string;
}

async function fetchVideos(uploadsPlaylistId: string, apiKey: string): Promise<{ full: VideoItem[]; shorts: VideoItem[] }> {
  // 1. Get all video IDs from uploads playlist
  const allItems: { videoId: string; publishedAt: string }[] = [];
  let pageToken: string | undefined;

  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}&key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) break;
    const json = await res.json();
    for (const item of json.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      if (videoId) allItems.push({ videoId, publishedAt: item.snippet.publishedAt });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  if (allItems.length === 0) return { full: [], shorts: [] };

  // 2. Fetch durations + snippets in batches of 50
  const videoDetails: Record<string, { duration: number; title: string; thumbnail: string | null }> = {};
  for (let i = 0; i < allItems.length; i += 50) {
    const ids = allItems.slice(i, i + 50).map(v => v.videoId).join(',');
    const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids}&key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) continue;
    const json = await res.json();
    for (const v of json.items ?? []) {
      videoDetails[v.id] = {
        duration: parseDuration(v.contentDetails?.duration ?? ''),
        title: v.snippet?.title ?? '',
        thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
      };
    }
  }

  // 3. Categorize: ≤ 60s → Shorts, > 60s → Full
  const full: VideoItem[] = [];
  const shorts: VideoItem[] = [];

  for (const { videoId, publishedAt } of allItems) {
    const detail = videoDetails[videoId];
    if (!detail) continue;
    const item: VideoItem = {
      id: videoId,
      title: detail.title,
      thumbnail: detail.thumbnail,
      duration: detail.duration,
      publishedAt,
      url: detail.duration <= 60
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
    };
    if (detail.duration <= 60) {
      shorts.push(item);
    } else {
      full.push(item);
    }
  }

  return { full, shorts };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'id must be a number', 400);

    const channel = channelsRepo.findById(channelId);
    if (!channel) return err('CHANNEL_NOT_FOUND', `Channel ${channelId} not found`, 404);

    const youtubeId = channel.youtube_channel_id;
    if (!youtubeId) return err('NO_YOUTUBE_ID', 'Channel has no youtube_channel_id', 400);

    const apiKey = process.env.YOUTUBE_API_KEY;

    if (apiKey) {
      const isHandle = youtubeId.startsWith('@');
      const idParam = isHandle
        ? `forHandle=${encodeURIComponent(youtubeId.slice(1))}`
        : `id=${encodeURIComponent(youtubeId)}`;

      const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings,statistics,contentDetails&${idParam}&key=${apiKey}`;
      const res = await fetch(apiUrl, { next: { revalidate: 3600 } });
      if (!res.ok) return err('YOUTUBE_API_ERROR', `YouTube API returned ${res.status}`, 502);

      const json = await res.json();
      const item = json.items?.[0];
      if (!item) return err('YOUTUBE_NOT_FOUND', 'Channel not found on YouTube', 404);

      const snippet = item.snippet ?? {};
      const branding = item.brandingSettings?.image ?? {};
      const stats = item.statistics ?? {};
      const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;

      // Fetch video breakdown
      const { full, shorts } = uploadsPlaylistId
        ? await fetchVideos(uploadsPlaylistId, apiKey)
        : { full: [], shorts: [] };

      return ok({
        source: 'api',
        title: snippet.title ?? null,
        description: snippet.description ?? null,
        customUrl: snippet.customUrl ?? null,
        publishedAt: snippet.publishedAt ?? null,
        thumbnail: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? null,
        banner: branding.bannerExternalUrl ?? null,
        subscriberCount: stats.subscriberCount ? Number(stats.subscriberCount) : null,
        videoCount: stats.videoCount ? Number(stats.videoCount) : null,
        viewCount: stats.viewCount ? Number(stats.viewCount) : null,
        country: snippet.country ?? null,
        channelUrl: snippet.customUrl
          ? `https://www.youtube.com/${snippet.customUrl}`
          : `https://www.youtube.com/channel/${youtubeId}`,
        fullVideos: full,
        shortsVideos: shorts,
      });
    }

    // Fallback: YouTube oEmbed (no API key needed)
    const channelUrl = youtubeId.startsWith('@')
      ? `https://www.youtube.com/${youtubeId}`
      : `https://www.youtube.com/channel/${youtubeId}`;

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(channelUrl)}&format=json`;
    const res = await fetch(oembedUrl, { next: { revalidate: 3600 } });

    if (!res.ok) {
      return ok({
        source: 'local',
        title: channel.channel_name,
        description: null,
        customUrl: channel.channel_handle ? `@${channel.channel_handle}` : null,
        thumbnail: null,
        banner: null,
        subscriberCount: null,
        videoCount: null,
        viewCount: null,
        country: null,
        channelUrl,
        fullVideos: [],
        shortsVideos: [],
      });
    }

    const oembed = await res.json();
    return ok({
      source: 'oembed',
      title: oembed.author_name ?? channel.channel_name,
      description: null,
      customUrl: channel.channel_handle ? `@${channel.channel_handle}` : null,
      thumbnail: oembed.thumbnail_url ?? null,
      banner: null,
      subscriberCount: null,
      videoCount: null,
      viewCount: null,
      country: null,
      channelUrl: oembed.author_url ?? channelUrl,
      fullVideos: [],
      shortsVideos: [],
    });
  } catch (e) {
    return handleError(e);
  }
}
