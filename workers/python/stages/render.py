"""
Remotion 렌더 Stage
채널 리소스 폴더의 bg_default.jpg 존재 확인 후 렌더
"""

import asyncio
import logging
import os
import sqlite3
import time
from pathlib import Path

logger = logging.getLogger('stages.render')

ROOT = Path(__file__).parent.parent.parent.parent  # 프로젝트 루트
SUNO_VIDEO_ROOT = Path(os.environ.get('SUNO_VIDEO_ROOT', str(Path.home() / 'Projects/clones/suno-video')))


async def handle_render(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      suno_track_id: str
      channel_id: int
    """
    workspace_id = payload['workspace_id']
    suno_track_id = payload['suno_track_id']
    channel_id = payload['channel_id']

    # 채널 리소스 폴더 프리플라이트 체크
    resource_dir = ROOT / 'config' / 'channels' / str(channel_id)
    bg_default = resource_dir / 'bg_default.jpg'

    if not bg_default.exists():
        raise RuntimeError(
            f"프리플라이트 실패: bg_default.jpg 없음 — {bg_default}\n"
            f"채널 {channel_id} 리소스 폴더에 bg_default.jpg를 추가하세요."
        )

    logger.info(f"Remotion 렌더 시작: track={suno_track_id}, channel={channel_id}")

    # 곡별 이미지 확인 (없으면 bg_default 사용)
    song_image = resource_dir / 'songs' / f'{suno_track_id}.jpg'
    bg_image = str(song_image) if song_image.exists() else str(bg_default)

    # 출력 디렉토리
    output_dir = ROOT / 'data' / 'renders' / workspace_id
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f'{suno_track_id}.mp4'

    # suno-video의 render.sh 실행
    render_sh = SUNO_VIDEO_ROOT / 'scripts' / 'render.sh'

    if not render_sh.exists():
        logger.warning(f"render.sh 없음: {render_sh} — 스텁 실행")
        # 테스트용 더미 파일 생성
        output_path.touch()
        logger.info(f"렌더 스텁 완료: {output_path}")
        return {'video_path': str(output_path)}

    cmd = [
        'bash', str(render_sh),
        suno_track_id,
        '--bg-image', bg_image,
        '--output', str(output_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(SUNO_VIDEO_ROOT),
    )

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)  # 10분
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"렌더 타임아웃 (10분): {suno_track_id}")

    if proc.returncode != 0:
        raise RuntimeError(
            f"렌더 실패 (exit={proc.returncode}): {stderr.decode()[:500]}"
        )

    if not output_path.exists():
        raise RuntimeError(f"렌더 출력 없음: {output_path}")

    logger.info(f"렌더 완료: {output_path}")
    return {'video_path': str(output_path)}
