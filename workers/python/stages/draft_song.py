"""
draft_song 생성 Stage

draft_song.generate: midi_draft_row 컨텍스트 로드 → Suno custom_generate 호출 → clip_ids → draft_songs 업데이트 → draft_song.poll enqueue
draft_song.poll:     clip 상태 폴링 → 완료 시 audio_url/title/image_url/duration 저장 → status='done'
"""

import json
import logging
import os
import sqlite3
import time
import uuid

logger = logging.getLogger('stages.draft_song')

try:
    import aiohttp
    _HAS_AIOHTTP = True
except ImportError:
    import requests as _requests  # type: ignore
    _HAS_AIOHTTP = False

NEXTJS_BASE = os.environ.get('NEXTJS_API_URL', 'http://localhost:3001')
MAX_POLL_ATTEMPTS = 20
POLL_DELAY_MS = 30_000  # 30초


def _get_cookie(account_id: int) -> str:
    cookie = os.environ.get(f'SUNO_COOKIE_{account_id}')
    if not cookie:
        logger.warning(f"SUNO_COOKIE_{account_id} 없음 → SUNO_COOKIE_1 fallback")
        cookie = os.environ.get('SUNO_COOKIE_1', '')
    return cookie


def _fail_songs(conn: sqlite3.Connection, draft_song_ids: list[str], error_msg: str):
    """여러 draft_songs를 한 번에 failed 처리"""
    now = int(time.time() * 1000)
    for song_id in draft_song_ids:
        conn.execute(
            "UPDATE draft_songs SET status = 'failed', error_msg = ? WHERE id = ?",
            (error_msg[:500], song_id)
        )
    conn.commit()


async def handle_draft_song_generate(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      draft_row_id: str
      draft_song_ids: list[str]   # INSERT된 pending draft_songs 2개
      workspace_id: str
      midi_id: str                # workspace_midi.id
      account_id: int             # 선택적, 기본 1
    """
    draft_row_id = payload['draft_row_id']
    draft_song_ids: list[str] = payload['draft_song_ids']
    workspace_id = payload['workspace_id']
    midi_id = payload['midi_id']
    account_id = payload.get('account_id', 1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        # cover_clip_id 가드
        midi = conn.execute(
            'SELECT suno_cover_clip_id FROM workspace_midis WHERE id = ?', (midi_id,)
        ).fetchone()
        if not midi or not midi['suno_cover_clip_id']:
            logger.error(f"suno_cover_clip_id 미설정: midi={midi_id}")
            _fail_songs(conn, draft_song_ids, 'suno_cover_clip_id 미설정 — MIDI를 먼저 Suno에 업로드하세요')
            return

        cover_clip_id = midi['suno_cover_clip_id']

        # 2.5 workspace에서 suno_project_id 로드
        ws = conn.execute(
            'SELECT suno_project_id FROM workspaces WHERE id = ?', (workspace_id,)
        ).fetchone()
        suno_project_id = ws['suno_project_id'] if ws and ws['suno_project_id'] else None

        # 3. draft_row에서 lyrics + style_used 로드
        row = conn.execute(
            'SELECT lyrics, selected_style, made_title, title_en FROM midi_draft_rows WHERE id = ?', (draft_row_id,)
        ).fetchone()
        if not row:
            _fail_songs(conn, draft_song_ids, f'draft_row 없음: {draft_row_id}')
            return

        lyrics = row['lyrics'] or ''
        title = row['made_title'] or row['title_en'] or 'Untitled'
        # draft_songs.style_used 우선, 없으면 draft_row.selected_style fallback
        songs = conn.execute(
            'SELECT id, style_used, original_ratio, style_weight, weirdness, vocal_gender FROM draft_songs WHERE id IN ({}) ORDER BY sort_order ASC'.format(
                ','.join('?' * len(draft_song_ids))
            ),
            draft_song_ids
        ).fetchall()

        style_used = ''
        original_ratio = None
        style_weight = None
        weirdness_val = None
        vocal_gender = None
        if songs:
            style_used = songs[0]['style_used'] or row['selected_style'] or ''
            original_ratio = songs[0]['original_ratio'] if 'original_ratio' in songs[0].keys() else None
            style_weight = songs[0]['style_weight'] if 'style_weight' in songs[0].keys() else None
            weirdness_val = songs[0]['weirdness'] if 'weirdness' in songs[0].keys() else None
            vocal_gender = songs[0]['vocal_gender'] if 'vocal_gender' in songs[0].keys() else None

        logger.info(
            f"draft_song.generate 시작: draft_row={draft_row_id}, "
            f"songs={draft_song_ids}, style='{style_used[:40]}'"
        )

        # 4. 스타일 태그에서 vocal_gender와 충돌하는 성별 보컬 키워드 제거
        import re
        tags_for_suno = style_used
        if vocal_gender in ('m', 'f'):
            # m/f 지정 시 스타일 태그의 성별 보컬 키워드를 제거하고 vocal_gender 파라미터에 위임
            gender_pattern = r',?\s*(?:intimate\s+)?(?:breathy\s+)?(?:female|male|여성|남성)\s+(?:vocals?|보컬)\b'
            tags_for_suno = re.sub(gender_pattern, '', tags_for_suno, flags=re.IGNORECASE).strip().strip(',').strip()

        # Suno custom_generate 호출
        cookie = _get_cookie(account_id)
        headers = {'Cookie': cookie, 'Content-Type': 'application/json'}
        body = {
            'prompt': lyrics,
            'tags': tags_for_suno,
            'title': title,
            'make_instrumental': False,
            'cover_clip_id': cover_clip_id,
            'is_remix': True,
            'mv': 'chirp-fenix',
        }
        if suno_project_id:
            body['project_id'] = suno_project_id
        if original_ratio is not None:
            body['audio_weight'] = original_ratio / 100.0  # 0~100 → 0.0~1.0
        body['style_weight'] = (style_weight / 100.0) if style_weight is not None else 0.5
        body['weirdness'] = (weirdness_val / 100.0) if weirdness_val is not None else 0.5
        if vocal_gender:
            body['vocal_gender'] = vocal_gender  # 'f' or 'm'

        url = f"{NEXTJS_BASE}/api/custom_generate"

        if _HAS_AIOHTTP:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, json=body, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=90)
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        raise RuntimeError(f"custom_generate 실패 (HTTP {resp.status}): {text[:400]}")
                    data = await resp.json()
        else:
            resp = _requests.post(url, json=body, headers=headers, timeout=90)
            if resp.status_code != 200:
                raise RuntimeError(f"custom_generate 실패 (HTTP {resp.status_code}): {resp.text[:400]}")
            data = resp.json()

        if not isinstance(data, list) or not data:
            raise RuntimeError(f"custom_generate 응답 형식 오류: {str(data)[:200]}")

        clip_ids = [item['id'] for item in data if 'id' in item]
        if not clip_ids:
            raise RuntimeError(f"clip_ids 없음: {str(data)[:200]}")

        logger.info(f"clip_ids 획득: {clip_ids}")

        # 5. draft_songs에 suno_id 저장 + status=processing
        # clip이 songs보다 적으면 초과분을 즉시 failed 처리 (poll stuck 방지)
        now = int(time.time() * 1000)
        if len(clip_ids) < len(songs):
            for song in songs[len(clip_ids):]:
                conn.execute(
                    "UPDATE draft_songs SET status = 'failed', error_msg = ? WHERE id = ?",
                    (f"Suno 응답 clip 부족 ({len(clip_ids)}/{len(songs)}개)", song['id'])
                )
            logger.warning(f"clip 수 부족: {len(clip_ids)}개 응답 / {len(songs)}개 요청")

        for i, song in enumerate(songs[:len(clip_ids)]):
            conn.execute(
                "UPDATE draft_songs SET suno_id = ?, status = 'processing' WHERE id = ?",
                (clip_ids[i], song['id'])
            )

        # 6. draft_song.poll enqueue — clip이 할당된 songs만 대상 (30초 후)
        active_song_ids = [songs[i]['id'] for i in range(len(clip_ids))]
        poll_payload = {
            'draft_song_ids': active_song_ids,
            'clip_ids': clip_ids,
            'account_id': account_id,
            'workspace_id': workspace_id,
            'poll_count': 0,
        }
        conn.execute(
            "INSERT INTO job_queue (id, type, payload, status, scheduled_at, max_attempts) VALUES (?, ?, ?, 'pending', ?, 3)",
            (str(uuid.uuid4()), 'draft_song.poll', json.dumps(poll_payload), now + POLL_DELAY_MS)
        )

        conn.commit()
        logger.info(f"draft_song.poll enqueued: {clip_ids}")

    except Exception as e:
        logger.error(f"draft_song.generate 오류: {e}")
        try:
            _fail_songs(conn, draft_song_ids, str(e)[:500])
        except Exception:
            pass
        raise
    finally:
        conn.close()


async def handle_draft_song_poll(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      draft_song_ids: list[str]
      clip_ids: list[str]
      account_id: int
      poll_count: int
    """
    draft_song_ids: list[str] = payload['draft_song_ids']
    clip_ids: list[str] = payload['clip_ids']
    account_id = payload.get('account_id', 1)
    poll_count = payload.get('poll_count', 0)

    logger.info(f"draft_song.poll: clip_ids={clip_ids}, poll_count={poll_count}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        if poll_count >= MAX_POLL_ATTEMPTS:
            logger.error(f"폴링 타임아웃: clip_ids={clip_ids}")
            _fail_songs(conn, draft_song_ids, f'폴링 타임아웃 ({MAX_POLL_ATTEMPTS}회 초과)')
            return

        cookie = _get_cookie(account_id)
        headers = {'Cookie': cookie}
        ids_str = ','.join(clip_ids)
        url = f"{NEXTJS_BASE}/api/get?ids={ids_str}"

        if _HAS_AIOHTTP:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        raise RuntimeError(f"get clips 실패 (HTTP {resp.status}): {text[:400]}")
                    clips = await resp.json()
        else:
            resp = _requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                raise RuntimeError(f"get clips 실패 (HTTP {resp.status_code}): {resp.text[:400]}")
            clips = resp.json()

        if not isinstance(clips, list):
            raise RuntimeError(f"get clips 응답 형식 오류: {str(clips)[:200]}")

        clips_by_id = {c['id']: c for c in clips if 'id' in c}

        now = int(time.time() * 1000)
        pending_ids: list[str] = []   # clip_ids 중 아직 미완료
        pending_songs: list[str] = [] # 대응하는 draft_song_ids

        # suno_id → draft_song_id 매핑 구성
        song_rows = conn.execute(
            'SELECT id, suno_id FROM draft_songs WHERE id IN ({})'.format(
                ','.join('?' * len(draft_song_ids))
            ),
            draft_song_ids
        ).fetchall()
        song_by_clip: dict[str, str] = {r['suno_id']: r['id'] for r in song_rows if r['suno_id']}

        for clip_id in clip_ids:
            clip = clips_by_id.get(clip_id)
            song_id = song_by_clip.get(clip_id)
            if not song_id:
                continue

            if clip is None:
                pending_ids.append(clip_id)
                pending_songs.append(song_id)
                continue

            status = clip.get('status', '')
            if status == 'complete':
                audio_url = clip.get('audio_url') or clip.get('stream_audio_url', '')
                conn.execute(
                    """
                    UPDATE draft_songs
                    SET status = 'done',
                        audio_url = ?,
                        title = ?,
                        image_url = ?,
                        duration = ?,
                        lyric = ?
                    WHERE id = ?
                    """,
                    (
                        audio_url,
                        clip.get('title', ''),
                        clip.get('image_url', ''),
                        clip.get('duration'),
                        clip.get('lyric', ''),
                        song_id,
                    )
                )
                logger.info(f"clip 완료: {clip_id} → song={song_id}")

                # R2 백업 (best-effort — 실패해도 poll 완료 처리는 유지)
                try:
                    import io
                    suno_id = clip_id
                    raw_audio_url = clip.get('audio_url') or clip.get('stream_audio_url', '')
                    raw_image_url = clip.get('image_url', '')

                    # workspace → channel → youtube_channel_id 조회
                    youtube_id = None
                    ws_id = payload.get('workspace_id')
                    if ws_id:
                        ws_ch_row = conn.execute(
                            '''SELECT c.youtube_channel_id
                               FROM workspaces w
                               JOIN channels c ON c.id = w.channel_id
                               WHERE w.id = ?''',
                            (ws_id,)
                        ).fetchone()
                        if ws_ch_row:
                            youtube_id = ws_ch_row['youtube_channel_id'].lower()

                    # R2 키: cover_songs/{youtube_id}/{suno_id}.ext  (youtube_id 없으면 cover_songs/{suno_id}.ext 폴백)
                    def _r2_key(suno_id: str, ext: str) -> str:
                        if youtube_id:
                            return f'cover_songs/{youtube_id}/{suno_id}.{ext}'
                        return f'cover_songs/{suno_id}.{ext}'

                    if raw_audio_url and _HAS_AIOHTTP:
                        import aiohttp as _aiohttp
                        async with _aiohttp.ClientSession() as dl_session:
                            async with dl_session.get(raw_audio_url) as dl_resp:
                                if dl_resp.status == 200:
                                    audio_bytes = await dl_resp.read()
                                    audio_key = _r2_key(suno_id, 'mp3')
                                    form = _aiohttp.FormData()
                                    form.add_field('file', audio_bytes, filename=f'{suno_id}.mp3', content_type='audio/mpeg')
                                    form.add_field('key', audio_key)
                                    async with dl_session.post(f'{NEXTJS_BASE}/api/r2/upload', data=form) as up_resp:
                                        if up_resp.status == 200:
                                            r2_data = await up_resp.json()
                                            r2_audio_url = r2_data.get('url', raw_audio_url)
                                            conn.execute(
                                                'UPDATE draft_songs SET audio_url = ? WHERE id = ?',
                                                (r2_audio_url, song_id)
                                            )
                                            logger.info(f"R2 audio 백업 완료: {suno_id} → {r2_audio_url}")

                    if raw_image_url and _HAS_AIOHTTP:
                        import aiohttp as _aiohttp
                        async with _aiohttp.ClientSession() as dl_session:
                            async with dl_session.get(raw_image_url) as dl_resp:
                                if dl_resp.status == 200:
                                    img_bytes = await dl_resp.read()
                                    ext = 'jpeg' if ('jpeg' in raw_image_url or 'jpg' in raw_image_url) else 'png'
                                    img_key = _r2_key(suno_id, ext)
                                    form = _aiohttp.FormData()
                                    form.add_field('file', img_bytes, filename=f'{suno_id}.{ext}', content_type=f'image/{ext}')
                                    form.add_field('key', img_key)
                                    async with dl_session.post(f'{NEXTJS_BASE}/api/r2/upload', data=form) as up_resp:
                                        if up_resp.status == 200:
                                            r2_data = await up_resp.json()
                                            r2_image_url = r2_data.get('url', raw_image_url)
                                            conn.execute(
                                                'UPDATE draft_songs SET image_url = ? WHERE id = ?',
                                                (r2_image_url, song_id)
                                            )
                                            logger.info(f"R2 image 백업 완료: {suno_id} → {r2_image_url}")
                except Exception as r2_err:
                    logger.warning(f"R2 백업 실패 (비치명적): {r2_err}")

                # Suno workspace에 clip 추가 (best-effort, Next.js internal API 경유)
                try:
                    ws_id = payload.get('workspace_id')
                    if ws_id:
                        ws_row = conn.execute(
                            'SELECT suno_project_id FROM workspaces WHERE id = ?', (ws_id,)
                        ).fetchone()
                        suno_proj_id = ws_row['suno_project_id'] if ws_row and ws_row['suno_project_id'] else None
                        if suno_proj_id:
                            add_url = f"{NEXTJS_BASE}/api/internal/suno-proxy/project-clips"
                            add_body = {'project_id': suno_proj_id, 'clip_ids': [clip_id], 'account_id': account_id}
                            if _HAS_AIOHTTP:
                                import aiohttp as _aiohttp
                                async with _aiohttp.ClientSession() as ws_session:
                                    async with ws_session.post(add_url, json=add_body, timeout=_aiohttp.ClientTimeout(total=30)) as ws_resp:
                                        if ws_resp.status == 200:
                                            logger.info(f"Suno workspace에 clip 추가: {clip_id} → {suno_proj_id}")
                                        else:
                                            ws_text = await ws_resp.text()
                                            logger.warning(f"workspace clip 추가 실패: HTTP {ws_resp.status} {ws_text[:200]}")
                except Exception as ws_err:
                    logger.warning(f"workspace clip 추가 실패 (비치명적): {ws_err}")

            elif status in ('error', 'failed'):
                conn.execute(
                    "UPDATE draft_songs SET status = 'failed', error_msg = ? WHERE id = ?",
                    (f"Suno clip 실패 (status={status})", song_id)
                )
                logger.warning(f"clip 실패: {clip_id}, status={status}")
            else:
                # 아직 처리 중 — title/image_url 먼저 저장 (audio 전에 사용 가능)
                partial_title = clip.get('title', '')
                partial_image = clip.get('image_url', '')
                if partial_title or partial_image:
                    conn.execute(
                        "UPDATE draft_songs SET title = COALESCE(NULLIF(?, ''), title), image_url = COALESCE(NULLIF(?, ''), image_url) WHERE id = ?",
                        (partial_title, partial_image, song_id)
                    )
                pending_ids.append(clip_id)
                pending_songs.append(song_id)

        if pending_ids:
            next_payload = {
                'draft_song_ids': pending_songs,
                'clip_ids': pending_ids,
                'account_id': account_id,
                'workspace_id': payload.get('workspace_id'),
                'poll_count': poll_count + 1,
            }
            conn.execute(
                "INSERT INTO job_queue (id, type, payload, status, scheduled_at, max_attempts) VALUES (?, ?, ?, 'pending', ?, 3)",
                (str(uuid.uuid4()), 'draft_song.poll', json.dumps(next_payload), now + POLL_DELAY_MS)
            )
            logger.info(f"재폴링 enqueued (poll_count={poll_count + 1}): {pending_ids}")

        conn.commit()

    except Exception as e:
        logger.error(f"draft_song.poll 오류: {e}")
        # 일시적 에러 시 재폴링 보장 (raise 안 함 → dispatcher retry와 충돌 방지)
        try:
            now = int(time.time() * 1000)
            next_payload = {
                'draft_song_ids': draft_song_ids,
                'clip_ids': clip_ids,
                'account_id': account_id,
                'workspace_id': payload.get('workspace_id'),
                'poll_count': poll_count + 1,
            }
            if poll_count + 1 < MAX_POLL_ATTEMPTS:
                conn.execute(
                    "INSERT INTO job_queue (id, type, payload, status, scheduled_at, max_attempts) VALUES (?, ?, ?, 'pending', ?, 5)",
                    (str(uuid.uuid4()), 'draft_song.poll', json.dumps(next_payload), now + POLL_DELAY_MS)
                )
                conn.commit()
                logger.info(f"에러 후 재폴링 enqueued (poll_count={poll_count + 1})")
            else:
                _fail_songs(conn, draft_song_ids, f'폴링 타임아웃+에러: {str(e)[:300]}')
        except Exception as inner:
            logger.error(f"재폴링 enqueue 실패: {inner}")
    finally:
        conn.close()
