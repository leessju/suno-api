"""
MIDI 변환 Stage
midi_cover.py를 subprocess로 실행하는 래퍼

midi_cover.py CLI 인터페이스:
  python3 midi_cover.py <source> --style <tags> --title <title>
                        [--lyrics <file>] [--model <model>]
                        [--soundfont <sf2>] [--api <url>]
                        [--output <dir>] [--wait] [--skip-demucs]

이 핸들러는 Step 0~3(입력 → Demucs → Chord 추출 → MIDI 생성)만 실행하며,
Suno 업로드/생성 단계는 별도 job으로 분리된다.
subprocess로 midi_cover.py 전체를 호출하는 대신, 내부 단계를 직접 실행하되
midi_cover.py의 출력 규약(output_dir에 chords.mid, chords.mp3 생성)을 따른다.
"""

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from r2_utils import upload_file, r2_available

logger = logging.getLogger('stages.midi')

ROOT = Path(__file__).parent.parent.parent.parent  # 프로젝트 루트


async def handle_midi_convert(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      workspace_midi_id: str  # workspace_midis 테이블 ID
      source_audio_path: str  # mp3 또는 wav 경로 (또는 YouTube URL)
      soundfont: str | None
      style: str | None       # Suno 스타일 태그 (미사용, 메타데이터용)
      title: str | None       # 곡 제목 (미사용, 메타데이터용)
      skip_demucs: bool       # 기본 False
    """
    workspace_id = payload['workspace_id']
    workspace_midi_id = payload.get('workspace_midi_id')
    source_audio_path = payload['source_audio_path']
    soundfont = payload.get('soundfont')
    skip_demucs = payload.get('skip_demucs', False)

    # 상대 경로는 프로젝트 루트 기준 절대 경로로 변환
    is_youtube = source_audio_path.startswith('http')
    if not is_youtube and not Path(source_audio_path).is_absolute():
        source_audio_path = str(ROOT / source_audio_path)

    logger.info(f"MIDI 변환 시작: workspace={workspace_id}, midi_id={workspace_midi_id}, source={source_audio_path}")

    # workspace_midis 상태 설정
    initial_status = 'converting'
    if workspace_midi_id:
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                f"UPDATE workspace_midis SET status = '{initial_status}', updated_at = ? WHERE id = ?",
                (int(time.time() * 1000), workspace_midi_id)
            )
            conn.commit()
        finally:
            conn.close()

    midi_cover_script = ROOT / 'scripts' / 'midi_cover.py'
    output_dir = ROOT / 'data' / 'midi' / workspace_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # midi_cover.py는 Step 4~6(Suno 연동)까지 포함하므로
    # --style 과 --title을 더미로 전달하고 --wait 없이 실행해 Step 3까지만 활용.
    # 실제로는 Suno API 호출이 일어나지만, 이 핸들러의 목적은 MIDI/mp3 산출물 확보.
    cmd = [
        'python3', str(midi_cover_script),
        source_audio_path,
        '--style', payload.get('style', 'instrumental'),
        '--title', payload.get('title', 'cover'),
        '--output', str(output_dir),
    ]
    if soundfont:
        cmd.extend(['--soundfont', soundfont])
    if skip_demucs:
        cmd.append('--skip-demucs')

    # Step 3(MIDI 생성)까지만 실행되도록 --api를 존재하지 않는 주소로 설정해
    # Step 4(Suno 업로드) 이후에서 오류가 나더라도 MIDI 결과물은 확보된다.
    # 단, subprocess는 returncode != 0으로 종료될 수 있으므로 파일 존재 여부로 판단.
    cmd.extend(['--api', 'http://localhost:0'])

    logger.info(f"실행: {' '.join(str(c) for c in cmd)}")

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(ROOT),
    )

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=900)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("midi_cover.py 타임아웃 (900s)")

    # MIDI 파일 존재 여부로 성공 판단 (Step 4에서 Suno 오류가 나도 무시)
    midi_files = list(output_dir.glob('*.mid'))
    mp3_files = list(output_dir.glob('chords.mp3'))

    if not midi_files:
        stderr_text = stderr.decode(errors='replace')[:1000]
        raise RuntimeError(
            f"MIDI 파일 생성 실패 (exit={proc.returncode}): {stderr_text}"
        )

    midi_path = str(midi_files[0])
    mp3_path = str(mp3_files[0]) if mp3_files else ''

    logger.info(f"MIDI 변환 완료: {midi_path}")

    # R2 업로드 (환경 변수가 설정된 경우)
    midi_r2_key = midi_path  # 기본값: 로컬 경로
    mp3_r2_key = mp3_path
    source_audio_r2_key = None

    if r2_available():
        midi_id = workspace_midi_id or str(uuid.uuid4())
        try:
            midi_r2_key = upload_file(
                midi_path,
                f'audio/{workspace_id}/{midi_id}/original.mid',
                'audio/midi',
            )
            logger.info(f"MIDI R2 업로드 완료: {midi_r2_key}")
        except Exception as e:
            logger.warning(f"MIDI R2 업로드 실패 (로컬 경로 사용): {e}")

        if mp3_path:
            try:
                mp3_r2_key = upload_file(
                    mp3_path,
                    f'audio/{workspace_id}/{midi_id}/chords.mp3',
                    'audio/mpeg',
                )
                logger.info(f"chords.mp3 R2 업로드 완료: {mp3_r2_key}")
            except Exception as e:
                logger.warning(f"chords.mp3 R2 업로드 실패: {e}")

        # 원본 소스 오디오 업로드
        # - 로컬 MP3: source_audio_path 직접 업로드
        # - YouTube: midi_cover.py가 output_dir/original.mp3로 다운로드한 파일 업로드
        source_local_path = None
        if not is_youtube and Path(source_audio_path).exists():
            source_local_path = source_audio_path
        elif is_youtube:
            yt_downloaded = output_dir / 'original.mp3'
            if yt_downloaded.exists():
                source_local_path = str(yt_downloaded)

        if source_local_path:
            try:
                source_audio_r2_key = upload_file(
                    source_local_path,
                    f'audio/{workspace_id}/{midi_id}/source.mp3',
                    'audio/mpeg',
                )
                logger.info(f"source.mp3 R2 업로드 완료: {source_audio_r2_key}")
            except Exception as e:
                logger.warning(f"source.mp3 R2 업로드 실패: {e}")
    else:
        logger.info("R2 환경 변수 미설정 — 로컬 경로 사용")

    # DB에 midi_masters 저장
    conn = sqlite3.connect(db_path)
    try:
        master_id = str(uuid.uuid4())
        now = int(time.time() * 1000)

        conn.execute(
            """
            INSERT INTO midi_masters (id, midi_r2_key, mp3_r2_key, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (master_id, midi_r2_key, mp3_r2_key, now)
        )

        # workspace에 cover_midi_id 업데이트
        conn.execute(
            "UPDATE workspaces SET cover_midi_id = ?, updated_at = ? WHERE id = ?",
            (master_id, now, workspace_id)
        )

        # workspace_midis: midi_master_id 연결 + status 업데이트
        # YouTube/MP3 모두 analyzing으로 (schema에 없는 'midi_generating' 제거)
        if workspace_midi_id:
            next_status = 'analyzing'
            if source_audio_r2_key:
                conn.execute(
                    f"UPDATE workspace_midis SET midi_master_id = ?, status = '{next_status}', audio_url = ?, updated_at = ? WHERE id = ?",
                    (master_id, source_audio_r2_key, now, workspace_midi_id)
                )
            else:
                conn.execute(
                    f"UPDATE workspace_midis SET midi_master_id = ?, status = '{next_status}', updated_at = ? WHERE id = ?",
                    (master_id, now, workspace_midi_id)
                )
            # midi.analyze 잡 enqueue
            analyze_job_id = str(uuid.uuid4())
            # Gemini 분석은 MIDI 렌더링 mp3(chords.mp3)로 — 설계 문서 기준
            analyze_mp3 = mp3_path
            analyze_payload = json.dumps({
                'workspace_id': workspace_id,
                'workspace_midi_id': workspace_midi_id,
                'midi_path': midi_path,
                'mp3_path': analyze_mp3,
            })
            conn.execute(
                """
                INSERT INTO job_queue (id, type, payload, status, attempts, max_attempts, scheduled_at)
                VALUES (?, 'midi.analyze', ?, 'pending', 0, 3, ?)
                """,
                (analyze_job_id, analyze_payload, now)
            )

        conn.commit()
        logger.info(f"midi_masters 저장 완료: {master_id}")
    finally:
        conn.close()

    return {'midi_master_id': master_id, 'midi_path': midi_path}
