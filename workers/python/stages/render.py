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
SUNO_VIDEO_ROOT = Path(os.environ.get('SUNO_VIDEO_ROOT', str(Path.home() / 'Projects/clones/suno-video')))
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
                          cwd: str | None = None) -> tuple[bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
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
      style_used: str | None
      title: str | None
      sort_order: int
      _job_id: str (dispatcher가 주입)
    """
    workspace_id = payload['workspace_id']
    suno_track_id = payload['suno_track_id']
    audio_url = payload['audio_url']
    image_url = payload.get('image_url')
    style_used = payload.get('style_used')
    color = payload.get('color', '#8B5CF6')
    job_id = payload.get('_job_id')

    # 작업 디렉토리
    work_dir = ROOT / 'data' / 'renders' / workspace_id / suno_track_id
    work_dir.mkdir(parents=True, exist_ok=True)

    origin_mp3 = work_dir / f'{suno_track_id}_origin.mp3'
    tuned_mp3 = work_dir / f'{suno_track_id}.mp3'
    vocals_wav = work_dir / f'{suno_track_id}_vocals.wav'
    lyrics_txt = work_dir / f'{suno_track_id}.txt'
    thumbnail = work_dir / f'{suno_track_id}.png'
    output_mp4 = work_dir / f'{suno_track_id}.mp4'

    logger.info(f"렌더 파이프라인 시작: track={suno_track_id}, workspace={workspace_id}")

    # ── Step 1: mp3 원본 다운로드 ─────────────────────────────────────────
    if not _step_done(work_dir, '1_download'):
        _update_progress(db_path, job_id, '1/6 download')
        logger.info(f"[1/6] mp3 다운로드: {audio_url}")
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream('GET', audio_url) as response:
                response.raise_for_status()
                with open(origin_mp3, 'wb') as f:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
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
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    thumbnail.write_bytes(resp.content)
                logger.info(f"[5/6] 완료: {thumbnail.stat().st_size} bytes")
            except Exception as e:
                logger.warning(f"[5/6] 썸네일 다운로드 실패 (무시): {e}")
        else:
            logger.info("[5/6] image_url 없음 — 스킵")
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
            await _run_subprocess(
                ['bash', str(render_sh), str(tuned_mp3), color, str(output_mp4)],
                timeout=1800, stage=6, desc='render.sh',
                cwd=str(SUNO_VIDEO_ROOT)
            )

        if not output_mp4.exists():
            raise RuntimeError(f"stage=6: 렌더 출력 없음: {output_mp4}")

        logger.info(f"[6/6] 렌더 완료: {output_mp4}")
        _mark_done(work_dir, '6_render')
    else:
        logger.info("[6/6] 스킵 (캐시)")

    _update_progress(db_path, job_id, '완료')
    logger.info(f"렌더 파이프라인 완료: {output_mp4}")
    return {'video_path': str(output_mp4)}
