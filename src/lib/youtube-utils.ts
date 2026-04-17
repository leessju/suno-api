/**
 * YouTube URL에서 video ID 추출
 * 지원: https://www.youtube.com/watch?v=ID, https://youtu.be/ID, https://youtube.com/shorts/ID
 */
export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      // /shorts/ID 형태
      const shortsMatch = u.pathname.match(/\/shorts\/([^/?]+)/)
      if (shortsMatch) return shortsMatch[1]
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null
    }
  } catch { /* 잘못된 URL */ }
  return null
}

/**
 * YouTube video ID로 썸네일 URL 반환 (mqdefault: 320×180)
 */
export function getYoutubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}

/**
 * source_ref로 MIDI 썸네일 URL 반환
 * YouTube면 YT 썸네일, 그 외엔 null (null이면 기본 이미지 렌더링)
 */
export function getMidiThumbnail(sourceType: string, sourceRef: string | null, coverImage?: string | null): string | null {
  if (sourceType === 'youtube_video' && sourceRef) {
    const id = extractYoutubeVideoId(sourceRef)
    return id ? getYoutubeThumbnailUrl(id) : null
  }
  if (sourceType === 'mp3_file' && coverImage) {
    return coverImage
  }
  return null
}
