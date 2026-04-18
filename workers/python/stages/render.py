"""
Remotion 렌더 Stage — 6단계 순차 파이프라인
1. mp3 다운로드 (audio_url → _origin.mp3)
2. ffmpeg EQ 튜닝 (style_used → preset A/B → .mp3)
3. Demucs 보컬 분리 (STT 전용 → _vocals.wav)
4. 가사 텍스트 저장 (DB lyric → .txt)
5. 썸네일 다운로드 (image_url → .png)
6. render.sh 실행 (Remotion → .mp4)
"""

import asyncio
import glob
import logging
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path

import httpx

logger = logging.getLogger('stages.render')

ROOT = Path(__file__).parent.parent.parent.parent  # 프로젝트 루트


def _get_db_setting(key: str) -> str | None:
    """DB gem_global_settings에서 값을 조회"""
    try:
        conn = sqlite3.connect(str(ROOT / 'data' / 'music-gen.db'))
        row = conn.execute('SELECT value FROM gem_global_settings WHERE key = ?', (key,)).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None

# R2 경로 접두어 — /api/r2/object/ 뒤가 R2 key
R2_API_PREFIX = '/api/r2/object/'


def _extract_r2_key(url: str) -> str | None:
    """URL이 /api/r2/object/... 형태면 R2 key를 추출, 아니면 None"""
    if url and url.startswith(R2_API_PREFIX):
        return url[len(R2_API_PREFIX):]
    return None


async def _download_to(url: str, dest: Path):
    """URL 또는 R2 key에서 파일을 다운로드"""
    r2_key = _extract_r2_key(url)
    if r2_key:
        # R2 직접 다운로드 (인증 불필요)
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from r2_utils import download_file
        logger.info(f"  R2 직접 다운로드: {r2_key}")
        download_file(r2_key, dest)
    else:
        # 외부 URL은 httpx로 다운로드
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            async with client.stream('GET', url) as response:
                response.raise_for_status()
                with open(dest, 'wb') as f:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
SUNO_VIDEO_ROOT = Path(
    os.environ.get('SUNO_VIDEO_ROOT')
    or _get_db_setting('sys_suno_video_root')
    or str(Path.home() / 'Projects/clones/suno-video')
)
RENDER_OUTPUT_DIR = Path(
    os.environ.get('RENDER_OUTPUT_DIR')
    or _get_db_setting('sys_render_output_dir')
    or str(ROOT / 'data' / 'renders')
)
PYTHON_BIN = os.environ.get('DEMUCS_PYTHON', '/opt/miniconda3/envs/suno-video/bin/python3')

# EQ Preset A: J-pop, 발라드, acoustic (기본값)
EQ_PRESET_A = 'equalizer=f=250:g=-4,equalizer=f=800:g=-4,equalizer=f=3000:g=3,equalizer=f=5500:g=5,equalizer=f=8000:g=-2'
# EQ Preset B: EDM, Rock, Metal
EQ_PRESET_B = 'equalizer=f=60:g=2,equalizer=f=300:g=-3,equalizer=f=3500:g=3,equalizer=f=5500:g=3,equalizer=f=10000:g=3'
# Preset B 키워드
EDM_KEYWORDS = {'edm', 'rock', 'metal', 'punk', 'hardcore', 'industrial', 'electronic',
                'techno', 'house', 'dubstep', 'drum and bass', 'dnb', 'phonk'}


# ── 유틸리티 ──────────────────────────────────────────────────────────────────

def _step_done(work_dir: Path, step: str) -> bool:
    return (work_dir / f'{step}.done').exists()


def _mark_done(work_dir: Path, step: str):
    (work_dir / f'{step}.done').touch()


def _update_progress(db_path: str, job_id: str | None, progress: str):
    if not job_id:
        return
    try:
        conn = sqlite3.connect(db_path)
        conn.execute('PRAGMA busy_timeout=5000')
        conn.execute("UPDATE job_queue SET progress = ? WHERE id = ?", (progress, job_id))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"progress 업데이트 실패: {e}")


def _pick_eq_preset(style_used: str | None) -> str:
    if not style_used:
        return EQ_PRESET_A
    style_lower = style_used.lower()
    if any(kw in style_lower for kw in EDM_KEYWORDS):
        return EQ_PRESET_B
    return EQ_PRESET_A


async def _fetch_suno_lyrics(suno_id: str) -> str | None:
    """Suno API에서 실제 생성된 가사를 가져옴 (clip.lyric 필드)"""
    suno_cookie = os.environ.get('SUNO_COOKIE', '')
    if not suno_cookie:
        logger.warning("SUNO_COOKIE 없음 — 가사 조회 건너뜀")
        return None

    # __session JWT 추출
    jwt = None
    for part in suno_cookie.split(';'):
        part = part.strip()
        if part.startswith('__session='):
            jwt = part[len('__session='):]
            break

    if not jwt:
        logger.warning("SUNO_COOKIE에서 __session 추출 실패")
        return None

    headers = {
        'Authorization': f'Bearer {jwt}',
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Origin': 'https://suno.com',
        'Referer': 'https://suno.com/',
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f'https://studio-api-prod.suno.com/api/feed/v2?ids={suno_id}',
                headers=headers,
            )
            if resp.status_code == 200:
                clips = resp.json()
                if isinstance(clips, list) and len(clips) > 0:
                    lyric = clips[0].get('lyric')
                    if lyric:
                        return lyric
            logger.warning(f"Suno API 가사 조회 실패 (status={resp.status_code})")
    except Exception as e:
        logger.warning(f"Suno API 가사 조회 에러: {e}")

    return None


async def _run_subprocess(cmd: list[str], timeout: int, stage: int, desc: str,
                          cwd: str | None = None,
                          env: dict | None = None) -> tuple[bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"stage={stage}: {desc} timeout after {timeout}s")

    if proc.returncode != 0:
        raise RuntimeError(
            f"stage={stage}: {desc} failed (exit={proc.returncode}): {stderr.decode()[:500]}"
        )
    return stdout, stderr


# ── 메인 핸들러 ──────────────────────────────────────────────────────────────

async def handle_render(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      suno_track_id: str
      audio_url: str
      image_url: str | None
      render_bg_key: str | None  (R2 key for background image)
      style_used: str | None
      render_style: str | None   (Remotion composition style)
      title: str | None
      sort_order: int
      youtube_channel_id: str | None
      _job_id: str (dispatcher가 주입)
    """
    workspace_id = payload['workspace_id']
    suno_track_id = payload['suno_track_id']
    youtube_channel_id = payload.get('youtube_channel_id')
    audio_url = payload['audio_url']
    image_url = payload.get('image_url')
    render_bg_key = payload.get('render_bg_key')
    style_used = payload.get('style_used')
    render_style = payload.get('render_style', 'emotional-v2')
    title = payload.get('title')
    color = payload.get('color', '#8B5CF6')
    job_id = payload.get('_job_id')

    # 작업 디렉토리
    # 경로: {render_output_dir}/{youtube_channel_id}/{workspace_id}/{suno_track_id}
    channel_dir = RENDER_OUTPUT_DIR / youtube_channel_id if youtube_channel_id else RENDER_OUTPUT_DIR
    work_dir = channel_dir / workspace_id / suno_track_id
    work_dir.mkdir(parents=True, exist_ok=True)

    origin_mp3 = work_dir / f'{suno_track_id}_origin.mp3'
    tuned_mp3 = work_dir / f'{suno_track_id}.mp3'
    vocals_wav = work_dir / f'{suno_track_id}_vocals.wav'
    lyrics_txt = work_dir / f'{suno_track_id}.txt'
    thumbnail = work_dir / f'{suno_track_id}.png'
    output_mp4 = work_dir / f'{suno_track_id}.mp4'

    logger.info(f"렌더 파이프라인 시작: track={suno_track_id}, workspace={workspace_id}")

    # ── 캐시 무효화: 이전 payload와 비교 ─────────────────────────────────
    payload_file = work_dir / 'payload.json'
    cache_keys = {
        'audio_url': audio_url,
        'image_url': image_url,
        'render_bg_key': render_bg_key,
        'style_used': style_used,
    }
    if payload_file.exists():
        try:
            import json as _json
            prev = _json.loads(payload_file.read_text(encoding='utf-8'))
            changed = {k for k, v in cache_keys.items() if prev.get(k) != v}
            if changed:
                logger.info(f"payload 변경 감지: {changed}")
                # audio_url 변경 → 전체 캐시 삭제
                if 'audio_url' in changed:
                    for f in work_dir.glob('*.done'):
                        f.unlink()
                    logger.info("  → 전체 캐시 삭제 (audio_url 변경)")
                else:
                    # render_bg_key 또는 image_url 변경 → step 5, 6 삭제
                    if 'render_bg_key' in changed or 'image_url' in changed:
                        for step in ['5_thumbnail', '6_render']:
                            done = work_dir / f'{step}.done'
                            if done.exists():
                                done.unlink()
                        # 이전 bg 이미지 삭제
                        bg_file = work_dir / f'{suno_track_id}_bg.jpeg'
                        if bg_file.exists() and 'render_bg_key' in changed:
                            bg_file.unlink()
                        logger.info("  → step 5-6 캐시 삭제 (이미지 변경)")
                    # style_used 변경 → step 6만 삭제
                    if 'style_used' in changed:
                        done = work_dir / '6_render.done'
                        if done.exists():
                            done.unlink()
                        logger.info("  → step 6 캐시 삭제 (스타일 변경)")
        except Exception as e:
            logger.warning(f"이전 payload 비교 실패 (무시): {e}")

    # ── Step 1: mp3 원본 다운로드 ─────────────────────────────────────────
    if not _step_done(work_dir, '1_download'):
        _update_progress(db_path, job_id, '1/6 download')
        logger.info(f"[1/6] mp3 다운로드: {audio_url}")
        await _download_to(audio_url, origin_mp3)
        if origin_mp3.stat().st_size < 1000:
            raise RuntimeError(f"stage=1: mp3 too small ({origin_mp3.stat().st_size} bytes)")
        logger.info(f"[1/6] 완료: {origin_mp3.stat().st_size} bytes")
        _mark_done(work_dir, '1_download')
    else:
        logger.info("[1/6] 스킵 (캐시)")

    # ── Step 2: ffmpeg EQ 튜닝 ────────────────────────────────────────────
    if not _step_done(work_dir, '2_tune'):
        _update_progress(db_path, job_id, '2/6 tune')
        eq_preset = _pick_eq_preset(style_used)
        preset_name = 'B (EDM)' if eq_preset == EQ_PRESET_B else 'A (J-pop)'
        logger.info(f"[2/6] EQ 튜닝: preset {preset_name}")
        await _run_subprocess(
            ['ffmpeg', '-y', '-i', str(origin_mp3), '-af', eq_preset, str(tuned_mp3)],
            timeout=60, stage=2, desc='ffmpeg EQ'
        )
        _mark_done(work_dir, '2_tune')
    else:
        logger.info("[2/6] 스킵 (캐시)")

    # ── Step 3: Demucs 보컬 분리 (STT 전용) ──────────────────────────────
    if not _step_done(work_dir, '3_demucs'):
        _update_progress(db_path, job_id, '3/6 demucs')
        logger.info("[3/6] Demucs 보컬 분리 시작")
        with tempfile.TemporaryDirectory() as tmpdir:
            await _run_subprocess(
                [PYTHON_BIN, '-m', 'demucs', '--two-stems=vocals', '-d', 'mps',
                 '-o', tmpdir, str(origin_mp3)],
                timeout=600, stage=3, desc='demucs'
            )
            # Demucs 출력: {tmpdir}/htdemucs/{stem}/vocals.wav
            found = glob.glob(f"{tmpdir}/htdemucs/*/vocals.wav")
            if not found:
                raise RuntimeError("stage=3: demucs vocals.wav not found in output")
            shutil.copy2(found[0], str(vocals_wav))
        logger.info(f"[3/6] 완료: {vocals_wav}")
        _mark_done(work_dir, '3_demucs')
    else:
        logger.info("[3/6] 스킵 (캐시)")

    # ── Step 4: 가사 텍스트 저장 (Suno API에서 실제 생성 가사) ─────────────
    if not _step_done(work_dir, '4_lyrics'):
        _update_progress(db_path, job_id, '4/6 lyrics')
        logger.info("[4/6] Suno 가사 가져오기")
        lyrics_text = await _fetch_suno_lyrics(suno_track_id)
        if not lyrics_text:
            # Suno API 실패 시 DB fallback
            logger.info("[4/6] Suno API 실패 — DB에서 가사 조회")
            try:
                conn = sqlite3.connect(str(db_path))
                row = conn.execute('SELECT lyric FROM draft_songs WHERE suno_id = ?', (suno_track_id,)).fetchone()
                conn.close()
                if row and row[0]:
                    lyrics_text = row[0]
                    logger.info(f"[4/6] DB에서 가사 로드: {len(lyrics_text)} chars")
            except Exception as e:
                logger.warning(f"[4/6] DB 가사 조회 실패: {e}")
        if lyrics_text:
            lyrics_txt.write_text(lyrics_text, encoding='utf-8')
            logger.info(f"[4/6] 완료: {len(lyrics_text)} chars")
        else:
            logger.info("[4/6] 가사 없음 — 빈 파일 생성")
            lyrics_txt.write_text('', encoding='utf-8')
        _mark_done(work_dir, '4_lyrics')
    else:
        logger.info("[4/6] 스킵 (캐시)")

    # ── Step 5: 썸네일 다운로드 ───────────────────────────────────────────
    if not _step_done(work_dir, '5_thumbnail'):
        _update_progress(db_path, job_id, '5/6 thumbnail')
        if image_url:
            logger.info(f"[5/6] 썸네일 다운로드: {image_url}")
            try:
                await _download_to(image_url, thumbnail)
                logger.info(f"[5/6] 완료: {thumbnail.stat().st_size} bytes")
            except Exception as e:
                logger.warning(f"[5/6] 썸네일 다운로드 실패 (무시): {e}")
        else:
            logger.info("[5/6] image_url 없음 — 스킵")

        # 배경이미지 다운로드 (render_bg_key가 있으면 {suno_track_id}_bg.jpeg로 저장)
        if render_bg_key:
            bg_dest = work_dir / f'{suno_track_id}_bg.jpeg'
            logger.info(f"[5/6] 배경이미지 다운로드: {render_bg_key}")
            try:
                bg_url = f"{R2_API_PREFIX}{render_bg_key}"
                await _download_to(bg_url, bg_dest)
                logger.info(f"[5/6] 배경이미지 완료: {bg_dest.stat().st_size} bytes")
            except Exception as e:
                logger.warning(f"[5/6] 배경이미지 다운로드 실패 (무시): {e}")

        _mark_done(work_dir, '5_thumbnail')
    else:
        logger.info("[5/6] 스킵 (캐시)")

    # ── Step 6: render.sh 실행 ────────────────────────────────────────────
    if not _step_done(work_dir, '6_render'):
        _update_progress(db_path, job_id, '6/6 render')
        render_sh = SUNO_VIDEO_ROOT / 'scripts' / 'render.sh'

        if not render_sh.exists():
            logger.warning(f"render.sh 없음: {render_sh} — 스텁 실행")
            output_mp4.touch()
        else:
            logger.info(f"[6/6] Remotion 렌더 시작: {tuned_mp3.name}")
            render_env = {**os.environ}
            if title:
                render_env['SONG_NAME'] = title
            render_env['RENDER_STYLE'] = render_style
            await _run_subprocess(
                ['bash', str(render_sh), str(tuned_mp3), color, str(output_mp4)],
                timeout=1800, stage=6, desc='render.sh',
                cwd=str(SUNO_VIDEO_ROOT),
                env=render_env,
            )

        if not output_mp4.exists():
            raise RuntimeError(f"stage=6: 렌더 출력 없음: {output_mp4}")

        logger.info(f"[6/6] 렌더 완료: {output_mp4}")
        _mark_done(work_dir, '6_render')
    else:
        logger.info("[6/6] 스킵 (캐시)")

    # ── 순서+제목 파일명으로 심볼릭 링크 생성 ─────────────────────────────
    videos_dir = channel_dir / workspace_id / 'videos'
    videos_dir.mkdir(parents=True, exist_ok=True)
    sort_order = payload.get('sort_order', 0)
    safe_title = (title or suno_track_id).replace('/', '_').replace('\\', '_')
    named_mp4 = videos_dir / f"{sort_order:02d}_{safe_title}.mp4"
    try:
        # 같은 mp4를 가리키는 기존 링크 제거 (순서 변경 시 이전 번호 링크 정리)
        target = output_mp4.resolve()
        for existing_link in videos_dir.glob('*.mp4'):
            if existing_link.is_symlink() and existing_link.resolve() == target:
                existing_link.unlink()
        if named_mp4.exists() or named_mp4.is_symlink():
            named_mp4.unlink()
        named_mp4.symlink_to(target)
        logger.info(f"영상 링크: {named_mp4}")
    except Exception as e:
        logger.warning(f"영상 링크 생성 실패: {e}")

    # ── payload 저장 (다음 렌더 시 캐시 무효화 비교용) ──────────────────
    try:
        import json as _json
        payload_file.write_text(_json.dumps(cache_keys, ensure_ascii=False), encoding='utf-8')
    except Exception as e:
        logger.warning(f"payload.json 저장 실패: {e}")

    _update_progress(db_path, job_id, '완료')
    logger.info(f"렌더 파이프라인 완료: {output_mp4}")
    return {'video_path': str(output_mp4), 'named_path': str(named_mp4)}
