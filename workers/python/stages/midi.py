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
import logging
import sqlite3
import time
import uuid
from pathlib import Path

logger = logging.getLogger('stages.midi')

ROOT = Path(__file__).parent.parent.parent.parent  # 프로젝트 루트


async def handle_midi_convert(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      source_audio_path: str  # mp3 또는 wav 경로 (또는 YouTube URL)
      soundfont: str | None
      style: str | None       # Suno 스타일 태그 (미사용, 메타데이터용)
      title: str | None       # 곡 제목 (미사용, 메타데이터용)
      skip_demucs: bool       # 기본 False
    """
    workspace_id = payload['workspace_id']
    source_audio_path = payload['source_audio_path']
    soundfont = payload.get('soundfont')
    skip_demucs = payload.get('skip_demucs', False)

    logger.info(f"MIDI 변환 시작: workspace={workspace_id}, source={source_audio_path}")

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
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("midi_cover.py 타임아웃 (180s)")

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
            (master_id, midi_path, mp3_path, now)
        )

        # workspace에 cover_midi_id 업데이트
        conn.execute(
            "UPDATE workspaces SET cover_midi_id = ?, updated_at = ? WHERE id = ?",
            (master_id, now, workspace_id)
        )
        conn.commit()
        logger.info(f"midi_masters 저장 완료: {master_id}")
    finally:
        conn.close()

    return {'midi_master_id': master_id, 'midi_path': midi_path}
