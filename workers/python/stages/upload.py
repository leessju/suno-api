"""
YouTube 업로드 Stage
Google OAuth 토큰 기반 YouTube API 업로드
"""

import asyncio
import json
import logging
import os
import sqlite3
import time
from pathlib import Path

logger = logging.getLogger('stages.upload')

ROOT = Path(__file__).parent.parent.parent.parent
YOUTUBE_TOKEN_DIR = Path.home() / '.claude'


def _get_youtube_token(channel_id: int) -> dict | None:
    """채널별 YouTube OAuth 토큰 로드"""
    # 토큰 파일 패턴: ~/.claude/youtube_token_{channel_label}.json
    conn = sqlite3.connect(os.environ.get('MUSIC_GEN_DB_PATH', './data/music-gen.db'))
    try:
        row = conn.execute(
            "SELECT channel_name, youtube_channel_id FROM channels WHERE id = ?",
            (channel_id,)
        ).fetchone()
        if not row:
            return None
        channel_name = row[0].lower().replace(' ', '')
    finally:
        conn.close()

    # 토큰 파일 탐색
    for pattern in [
        YOUTUBE_TOKEN_DIR / f'youtube_token_{channel_name}.json',
        YOUTUBE_TOKEN_DIR / f'youtube_token_{channel_id}.json',
    ]:
        if pattern.exists():
            return json.loads(pattern.read_text())

    return None


async def handle_youtube_upload(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      suno_track_id: str
      video_path: str
      thumbnail_path: str (optional)
      channel_id: int
      title: str (optional)
      description: str (optional)
    """
    workspace_id = payload['workspace_id']
    suno_track_id = payload['suno_track_id']
    video_path = payload.get('video_path', '')
    channel_id = payload.get('channel_id')

    if not video_path or not Path(video_path).exists():
        raise RuntimeError(f"영상 파일 없음: {video_path}")

    logger.info(f"YouTube 업로드 시작: {suno_track_id}")

    token = _get_youtube_token(channel_id)
    if not token:
        logger.warning(f"YouTube 토큰 없음 (channel_id={channel_id}) — 업로드 스킵")
        return {'skipped': True, 'reason': 'no_token'}

    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        # 토큰 파일 내 client_id/secret 우선, env 변수 fallback
        creds = Credentials(
            token=token.get('token') or token.get('access_token'),
            refresh_token=token.get('refresh_token'),
            token_uri=token.get('token_uri', 'https://oauth2.googleapis.com/token'),
            client_id=token.get('client_id') or os.environ.get('YOUTUBE_CLIENT_ID', ''),
            client_secret=token.get('client_secret') or os.environ.get('YOUTUBE_CLIENT_SECRET', ''),
            scopes=token.get('scopes'),
        )

        youtube = build('youtube', 'v3', credentials=creds)

        # 영상 메타데이터
        title = payload.get('title', suno_track_id)
        description = payload.get('description', '')

        body = {
            'snippet': {
                'title': title,
                'description': description,
                'tags': ['AI music', 'Suno'],
                'categoryId': '10',  # Music
            },
            'status': {
                'privacyStatus': 'private',  # 먼저 private으로 올리고 나중에 공개
            },
        }

        # 파일 업로드 (비동기 실행을 위해 executor 사용)
        loop = asyncio.get_running_loop()

        def _upload():
            media = MediaFileUpload(
                video_path,
                mimetype='video/mp4',
                resumable=True,
                chunksize=10 * 1024 * 1024,  # 10MB 청크
            )
            request = youtube.videos().insert(
                part=','.join(body.keys()),
                body=body,
                media_body=media,
            )
            response = None
            while response is None:
                status, response = request.next_chunk()
                if status:
                    logger.info(f"업로드 진행: {int(status.progress() * 100)}%")
            return response

        response = await loop.run_in_executor(None, _upload)
        video_id = response['id']
        youtube_url = f'https://youtu.be/{video_id}'

        logger.info(f"업로드 완료: {youtube_url}")
        return {'video_id': video_id, 'youtube_url': youtube_url}

    except ImportError:
        logger.warning("google-api-python-client 미설치 — 업로드 스킵")
        return {'skipped': True, 'reason': 'no_google_client'}
    except Exception as e:
        raise RuntimeError(f"YouTube 업로드 실패: {e}")
