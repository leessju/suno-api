"""
Suno 생성 Stage

suno.generate: Next.js API를 통해 Suno 생성 요청 → clip_ids 획득 → suno.poll enqueue
suno.poll:     clip 상태 확인 → 완료 시 audio_url 저장 → workspace status 갱신
"""

import json
import logging
import os
import sqlite3
import time
import uuid

logger = logging.getLogger('stages.suno')

NEXTJS_BASE = os.environ.get('NEXTJS_API_URL', 'http://localhost:3001')
MAX_POLL_ATTEMPTS = 20
POLL_DELAY_MS = 30_000  # 30초


def _get_cookie(account_id: int) -> str:
    """SUNO_COOKIE_{account_id} 환경변수에서 쿠키 로드. 없으면 SUNO_COOKIE_1 fallback."""
    cookie = os.environ.get(f'SUNO_COOKIE_{account_id}')
    if not cookie:
        logger.warning(f"SUNO_COOKIE_{account_id} 없음 → SUNO_COOKIE_1 fallback")
        cookie = os.environ.get('SUNO_COOKIE_1', '')
    return cookie


async def handle_suno_generate(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      track_id: str           # workspace_tracks의 suno_track_id (미리 할당)
      prompt: str             # Gemini가 생성한 가사/프롬프트
      style: str              # 음악 스타일 태그
      title: str
      make_instrumental: bool # 기본 False
      account_id: int         # account_router가 선택한 계정 ID
    """
    try:
        import aiohttp
        _use_aiohttp = True
    except ImportError:
        logger.warning("aiohttp 없음 → requests fallback (동기)")
        import requests as _requests
        _use_aiohttp = False

    workspace_id = payload['workspace_id']
    track_id = payload.get('track_id', '')
    prompt = payload['prompt']
    style = payload.get('style', '')
    title = payload.get('title', '')
    make_instrumental = payload.get('make_instrumental', False)
    account_id = payload.get('account_id', 1)

    logger.info(f"Suno 생성 시작: workspace={workspace_id}, account={account_id}")

    cookie = _get_cookie(account_id)
    headers = {'Cookie': cookie, 'Content-Type': 'application/json'}
    body = {
        'prompt': prompt,
        'tags': style,
        'title': title,
        'make_instrumental': make_instrumental,
    }

    url = f"{NEXTJS_BASE}/api/custom_generate"

    if _use_aiohttp:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise RuntimeError(f"custom_generate 실패 (HTTP {resp.status}): {text[:500]}")
                data = await resp.json()
    else:
        resp = _requests.post(url, json=body, headers=headers, timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"custom_generate 실패 (HTTP {resp.status_code}): {resp.text[:500]}")
        data = resp.json()

    # 응답: [{id: clip_id, ...}, ...]
    if not isinstance(data, list) or not data:
        raise RuntimeError(f"custom_generate 응답 형식 오류: {str(data)[:200]}")

    clip_ids = [item['id'] for item in data if 'id' in item]
    if not clip_ids:
        raise RuntimeError(f"clip_ids 없음: {str(data)[:200]}")

    logger.info(f"clip_ids 획득: {clip_ids}")

    # DB 업데이트
    conn = sqlite3.connect(db_path)
    try:
        now = int(time.time() * 1000)

        # workspace status → 'generating'
        conn.execute(
            "UPDATE workspaces SET status = 'generating', updated_at = ? WHERE id = ?",
            (now, workspace_id)
        )

        # workspace_tracks에 suno_track_id, suno_account_id 저장
        # clip_ids 중 첫 번째를 primary track에 매핑 (track_id로 식별)
        for i, clip_id in enumerate(clip_ids):
            if i == 0 and track_id:
                conn.execute(
                    """
                    UPDATE workspace_tracks
                    SET suno_track_id = ?, suno_account_id = ?
                    WHERE workspace_id = ? AND variant_id = ?
                    """,
                    (clip_id, account_id, workspace_id, track_id)
                )
            else:
                # 추가 clip은 variant_id = clip_id로 upsert
                conn.execute(
                    """
                    INSERT INTO workspace_tracks (workspace_id, suno_track_id, variant_id, suno_account_id, is_checked)
                    VALUES (?, ?, ?, ?, 0)
                    ON CONFLICT(workspace_id, variant_id) DO UPDATE SET
                        suno_track_id = excluded.suno_track_id,
                        suno_account_id = excluded.suno_account_id
                    """,
                    (workspace_id, clip_id, clip_id, account_id)
                )

        # suno.poll job enqueue (30초 후)
        poll_payload = {
            'workspace_id': workspace_id,
            'clip_ids': clip_ids,
            'account_id': account_id,
            'poll_count': 0,
        }
        scheduled_at_ms = now + POLL_DELAY_MS
        conn.execute(
            "INSERT INTO job_queue (id, type, payload, status, scheduled_at, max_attempts) VALUES (?, ?, ?, 'pending', ?, 3)",
            (str(uuid.uuid4()), 'suno.poll', json.dumps(poll_payload), scheduled_at_ms)
        )

        conn.commit()
        logger.info(f"suno.poll enqueued (scheduled_at={scheduled_at_ms}): {clip_ids}")
    finally:
        conn.close()


async def handle_suno_poll(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      clip_ids: list[str]
      account_id: int
      poll_count: int         # 현재까지 폴링 횟수
    """
    try:
        import aiohttp
        _use_aiohttp = True
    except ImportError:
        import requests as _requests
        _use_aiohttp = False

    workspace_id = payload['workspace_id']
    clip_ids = payload['clip_ids']
    account_id = payload.get('account_id', 1)
    poll_count = payload.get('poll_count', 0)

    logger.info(f"Suno 폴링: workspace={workspace_id}, clip_ids={clip_ids}, poll_count={poll_count}")

    if poll_count >= MAX_POLL_ATTEMPTS:
        logger.error(f"최대 폴링 횟수 초과 ({MAX_POLL_ATTEMPTS}): workspace={workspace_id}")
        _update_workspace_status(db_path, workspace_id, 'failed')
        return

    cookie = _get_cookie(account_id)
    headers = {'Cookie': cookie}
    ids_str = ','.join(clip_ids)
    url = f"{NEXTJS_BASE}/api/get?ids={ids_str}"

    if _use_aiohttp:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise RuntimeError(f"get clips 실패 (HTTP {resp.status}): {text[:500]}")
                clips = await resp.json()
    else:
        resp = _requests.get(url, headers=headers, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"get clips 실패 (HTTP {resp.status_code}): {resp.text[:500]}")
        clips = resp.json()

    if not isinstance(clips, list):
        raise RuntimeError(f"get clips 응답 형식 오류: {str(clips)[:200]}")

    # 상태 분류
    clips_by_id = {c['id']: c for c in clips if 'id' in c}
    complete_clips = []
    pending_clip_ids = []
    failed_clip_ids = []

    for clip_id in clip_ids:
        clip = clips_by_id.get(clip_id)
        if clip is None:
            pending_clip_ids.append(clip_id)
            continue
        status = clip.get('status', '')
        if status == 'complete':
            complete_clips.append(clip)
        elif status in ('error', 'failed'):
            failed_clip_ids.append(clip_id)
            logger.warning(f"clip 실패: {clip_id}, status={status}")
        else:
            pending_clip_ids.append(clip_id)

    logger.info(
        f"폴링 결과: complete={len(complete_clips)}, pending={len(pending_clip_ids)}, failed={len(failed_clip_ids)}"
    )

    conn = sqlite3.connect(db_path)
    try:
        now = int(time.time() * 1000)

        # 완료된 clip의 audio_url을 workspace_tracks에 저장
        for clip in complete_clips:
            audio_url = clip.get('audio_url') or clip.get('stream_audio_url', '')
            if audio_url:
                conn.execute(
                    """
                    UPDATE workspace_tracks
                    SET suno_track_id = ?
                    WHERE workspace_id = ? AND suno_track_id = ?
                    """,
                    (clip['id'], workspace_id, clip['id'])
                )
                # audio_url 컬럼이 있으면 저장 (없으면 무시)
                try:
                    conn.execute(
                        """
                        UPDATE workspace_tracks
                        SET audio_url = ?
                        WHERE workspace_id = ? AND suno_track_id = ?
                        """,
                        (audio_url, workspace_id, clip['id'])
                    )
                except sqlite3.OperationalError:
                    pass  # audio_url 컬럼 없음

        # 아직 pending인 clip이 있으면 재폴링 enqueue
        remaining_ids = pending_clip_ids + failed_clip_ids
        if remaining_ids:
            next_payload = {
                'workspace_id': workspace_id,
                'clip_ids': remaining_ids,
                'account_id': account_id,
                'poll_count': poll_count + 1,
            }
            scheduled_at_ms = now + POLL_DELAY_MS
            conn.execute(
                "INSERT INTO job_queue (id, type, payload, status, scheduled_at, max_attempts) VALUES (?, ?, ?, 'pending', ?, 3)",
                (str(uuid.uuid4()), 'suno.poll', json.dumps(next_payload), scheduled_at_ms)
            )
            logger.info(f"재폴링 enqueued (poll_count={poll_count + 1}): {remaining_ids}")
        else:
            # 모든 clip 완료 → workspace status='done'
            conn.execute(
                "UPDATE workspaces SET status = 'done', updated_at = ? WHERE id = ?",
                (now, workspace_id)
            )
            logger.info(f"모든 clip 완료 → workspace status=done: {workspace_id}")

        conn.commit()
    finally:
        conn.close()


def _update_workspace_status(db_path: str, workspace_id: str, status: str):
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE workspaces SET status = ?, updated_at = ? WHERE id = ?",
            (status, int(time.time() * 1000), workspace_id)
        )
        conn.commit()
    finally:
        conn.close()
