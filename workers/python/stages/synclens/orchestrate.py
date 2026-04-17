"""
SyncLens Pipeline Orchestrate Handler

synclens.* job 완료 후 dispatcher가 자동 enqueue하는 meta handler.
DAG 규칙에 따라 다음 pipeline step을 결정하고 job_queue에 등록.
"""

import json
import logging
import sqlite3
import time
import uuid

logger = logging.getLogger('synclens.orchestrate')

# Song phase step 순서
SONG_STEPS = ['S1', 'S2', 'S3', 'S4', 'S5']
SONG_JOB_TYPES = {
    'S1': 'synclens.extract_lyrics',
    'S2': 'synclens.translate_lyrics',
    'S3': 'synclens.generate_cover',
    'S4': 'synclens.render_song',
    'S5': 'synclens.verify_audio',
}

# Vol phase step 순서
VOL_STEPS = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8']
VOL_JOB_TYPES = {
    'V1': 'synclens.concat_videos',
    'V2': 'synclens.assign_backgrounds',
    'V3': 'synclens.gen_thumbnails',
    'V4': 'synclens.gen_subtitles',
    'V5': 'synclens.upload_full',
    'V6': 'synclens.gen_shorts',
    'V7': 'synclens.upload_shorts',
    'V8': 'synclens.post_comment',
}


def _get_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA busy_timeout=5000')
    return conn


def _enqueue_job(conn: sqlite3.Connection, job_type: str, payload: dict, delay_ms: int = 0) -> str:
    """job_queue에 job INSERT. job_id 반환."""
    job_id = str(uuid.uuid4())
    now = int(time.time() * 1000)
    conn.execute(
        """
        INSERT INTO job_queue (id, type, payload, status, attempts, max_attempts, scheduled_at)
        VALUES (?, ?, ?, 'pending', 0, 3, ?)
        """,
        (job_id, job_type, json.dumps(payload), now + delay_ms)
    )
    return job_id


def _log_event(conn: sqlite3.Connection, run_id: str, event_type: str,
               message: str, step_id: str | None = None, metadata: dict | None = None):
    conn.execute(
        """
        INSERT INTO pipeline_events (run_id, step_id, event_type, message, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (run_id, step_id, event_type, message,
         json.dumps(metadata) if metadata else None,
         int(time.time() * 1000))
    )


async def handle_synclens_orchestrate(payload: dict, db_path: str):
    """
    synclens.* job 완료 후 다음 step을 결정해 enqueue.
    payload: {run_id, completed_step_id}
    """
    run_id = payload.get('run_id')
    completed_step_id = payload.get('completed_step_id')

    if not run_id:
        logger.error("orchestrate: run_id 없음")
        return

    conn = _get_db(db_path)
    try:
        # 1. run 조회
        run = conn.execute(
            "SELECT * FROM pipeline_runs WHERE id = ?", (run_id,)
        ).fetchone()
        if not run:
            logger.error(f"orchestrate: run 없음 [{run_id}]")
            return

        run = dict(run)
        if run['status'] in ('completed', 'cancelled', 'failed'):
            logger.info(f"orchestrate: run 이미 종료 [{run_id}] status={run['status']}")
            return

        # 2. completed_step 마킹
        completed_step = None
        if completed_step_id:
            conn.execute(
                "UPDATE pipeline_steps SET status='completed', completed_at=? WHERE id=?",
                (int(time.time() * 1000), completed_step_id)
            )
            completed_step = conn.execute(
                "SELECT * FROM pipeline_steps WHERE id=?", (completed_step_id,)
            ).fetchone()
            if completed_step:
                completed_step = dict(completed_step)

        conn.commit()

        if not completed_step:
            # 초기 시작 — 첫 번째 pending step 찾기
            _start_first_step(conn, run, db_path)
            return

        phase = completed_step['phase']
        step_code = completed_step['step_code']

        _log_event(conn, run_id, 'step_completed',
                   f"{step_code} 완료 (song_index={completed_step.get('song_index')})",
                   step_id=completed_step_id)
        conn.commit()

        if phase == 'song':
            _handle_song_phase(conn, run, completed_step)
        elif phase == 'vol':
            _handle_vol_phase(conn, run, completed_step)

        conn.commit()

    except Exception as e:
        logger.error(f"orchestrate 오류 [{run_id}]: {e}")
        try:
            _log_event(conn, run_id, 'orchestrate_error', str(e))
            conn.commit()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def _start_first_step(conn: sqlite3.Connection, run: dict, db_path: str):
    """파이프라인 시작 — 첫 번째 곡 S1 enqueue."""
    run_id = run['id']
    first_step = conn.execute(
        """
        SELECT * FROM pipeline_steps
        WHERE run_id=? AND phase='song' AND song_index=1 AND step_code='S1' AND status='pending'
        """,
        (run_id,)
    ).fetchone()
    if not first_step:
        logger.warning(f"orchestrate: 시작할 S1 step 없음 [{run_id}]")
        return
    first_step = dict(first_step)
    _enqueue_step(conn, run, first_step)
    conn.execute(
        "UPDATE pipeline_runs SET status='running', started_at=? WHERE id=?",
        (int(time.time() * 1000), run_id)
    )
    _log_event(conn, run_id, 'pipeline_started', '파이프라인 시작')


def _handle_song_phase(conn: sqlite3.Connection, run: dict, completed_step: dict):
    """Song phase DAG: 같은 곡의 다음 step → 다음 곡 S1 → 전곡 완료 시 V1."""
    run_id = run['id']
    song_index = completed_step['song_index']
    step_code = completed_step['step_code']

    # 같은 곡의 다음 step
    next_song_step_code = _next_song_step(step_code)
    if next_song_step_code:
        next_step = conn.execute(
            """
            SELECT * FROM pipeline_steps
            WHERE run_id=? AND phase='song' AND song_index=? AND step_code=? AND status='pending'
            """,
            (run_id, song_index, next_song_step_code)
        ).fetchone()
        if next_step:
            _enqueue_step(conn, run, dict(next_step))
            return

    # S5 완료 — 이 곡 완료
    if step_code == 'S5':
        total_songs = run['total_songs']
        next_song_index = song_index + 1

        if next_song_index <= total_songs:
            # 다음 곡 S1 enqueue (순차)
            next_step = conn.execute(
                """
                SELECT * FROM pipeline_steps
                WHERE run_id=? AND phase='song' AND song_index=? AND step_code='S1' AND status='pending'
                """,
                (run_id, next_song_index)
            ).fetchone()
            if next_step:
                _enqueue_step(conn, run, dict(next_step))
                return

        # 전곡 완료 확인
        pending_song = conn.execute(
            "SELECT COUNT(*) as cnt FROM pipeline_steps WHERE run_id=? AND phase='song' AND status NOT IN ('completed','skipped')",
            (run_id,)
        ).fetchone()['cnt']

        if pending_song == 0:
            # Vol phase 시작
            conn.execute(
                "UPDATE pipeline_runs SET current_phase='vol' WHERE id=?", (run_id,)
            )
            _log_event(conn, run_id, 'song_phase_completed', '모든 곡 처리 완료 — Vol phase 시작')
            _start_vol_step(conn, run, 'V1')


def _handle_vol_phase(conn: sqlite3.Connection, run: dict, completed_step: dict):
    """Vol phase DAG: V1→V2→...→V8 순차."""
    run_id = run['id']
    step_code = completed_step['step_code']

    next_vol_code = _next_vol_step(step_code)
    if next_vol_code:
        _start_vol_step(conn, run, next_vol_code)
    else:
        # V8 완료 — 파이프라인 전체 완료
        now = int(time.time() * 1000)
        conn.execute(
            "UPDATE pipeline_runs SET status='completed', completed_at=? WHERE id=?",
            (now, run_id)
        )
        _log_event(conn, run_id, 'pipeline_completed', '파이프라인 완료')
        # Telegram 알림
        _enqueue_job(conn, 'telegram.send', {
            'message': f"[SyncLens] {run['vol_name']} 파이프라인 완료"
        })


def _start_vol_step(conn: sqlite3.Connection, run: dict, vol_code: str):
    """Vol step을 찾아 enqueue."""
    step = conn.execute(
        "SELECT * FROM pipeline_steps WHERE run_id=? AND phase='vol' AND step_code=? AND status='pending'",
        (run['id'], vol_code)
    ).fetchone()
    if step:
        _enqueue_step(conn, run, dict(step))


def _enqueue_step(conn: sqlite3.Connection, run: dict, step: dict):
    """step에 해당하는 job_queue 항목 INSERT + pipeline_steps job_id 업데이트."""
    step_code = step['step_code']
    phase = step['phase']

    if phase == 'song':
        job_type = SONG_JOB_TYPES.get(step_code)
    else:
        job_type = VOL_JOB_TYPES.get(step_code)

    if not job_type:
        logger.error(f"알 수 없는 step_code: {step_code}")
        return

    payload = {
        'run_id': run['id'],
        'step_id': step['id'],
        'sync_lens_path': run['sync_lens_path'],
        'vol_name': run['vol_name'],
        'config_json': run['config_json'],
    }
    if phase == 'song':
        payload['song_index'] = step['song_index']
        payload['song_title'] = step['song_title']

    job_id = _enqueue_job(conn, job_type, payload)
    now = int(time.time() * 1000)
    conn.execute(
        "UPDATE pipeline_steps SET status='running', job_id=?, started_at=? WHERE id=?",
        (job_id, now, step['id'])
    )
    logger.info(f"Step enqueued: {step_code} [{step['id'][:8]}] → job [{job_id[:8]}]")


def _next_song_step(current: str) -> str | None:
    """현재 song step 다음 step code 반환. S5이면 None."""
    idx = SONG_STEPS.index(current) if current in SONG_STEPS else -1
    if idx < 0 or idx >= len(SONG_STEPS) - 1:
        return None
    return SONG_STEPS[idx + 1]


def _next_vol_step(current: str) -> str | None:
    """현재 vol step 다음 step code 반환. V8이면 None."""
    idx = VOL_STEPS.index(current) if current in VOL_STEPS else -1
    if idx < 0 or idx >= len(VOL_STEPS) - 1:
        return None
    return VOL_STEPS[idx + 1]
