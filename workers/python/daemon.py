"""
Polymorphic Imagining Music — Python Worker Daemon
asyncio 기반 job 처리 루프 (단일 인스턴스 보장)
"""

import asyncio
import logging
import os
import signal
import sys
import time
import uuid
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

# .env 로드 (R2, DB 등 환경 변수)
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env', override=False)
except ImportError:
    pass

from workers.python.dispatcher import Dispatcher

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('daemon')

PID_FILE = ROOT / 'data' / 'worker.pid'


def acquire_pid_lock() -> bool:
    """PID 파일로 단일 인스턴스 보장. 이미 실행 중이면 False 반환."""
    if PID_FILE.exists():
        try:
            existing_pid = int(PID_FILE.read_text().strip())
            # 해당 PID 프로세스가 실제로 살아있는지 확인
            os.kill(existing_pid, 0)
            logger.error(f"이미 실행 중인 daemon이 있습니다 (PID={existing_pid}). 종료합니다.")
            return False
        except (ProcessLookupError, ValueError):
            # 프로세스 없음 → stale PID 파일, 덮어씀
            pass
    PID_FILE.write_text(str(os.getpid()))
    return True


def release_pid_lock():
    try:
        PID_FILE.unlink(missing_ok=True)
    except Exception:
        pass


async def main():
    if not acquire_pid_lock():
        sys.exit(1)

    logger.info(f"Python Worker Daemon 시작 (PID={os.getpid()})")

    db_path = os.environ.get('MUSIC_GEN_DB_PATH', './data/music-gen.db')
    poll_interval = float(os.environ.get('WORKER_POLL_INTERVAL', '1.0'))

    dispatcher = Dispatcher(db_path=db_path, poll_interval=poll_interval)

    # stuck job/song 복구
    try:
        import sqlite3 as _sql
        _conn = _sql.connect(db_path)
        # running 상태 job → pending 리셋
        r1 = _conn.execute("UPDATE job_queue SET status = 'pending' WHERE status = 'running'")
        if r1.rowcount:
            logger.info(f"stuck running job {r1.rowcount}개 → pending 리셋")
        # processing draft_songs 중 대응 poll job 없는 것 → 새 poll job 생성
        _conn.row_factory = _sql.Row
        stuck = _conn.execute("""
            SELECT ds.id, ds.suno_id FROM draft_songs ds
            WHERE ds.status = 'processing' AND ds.suno_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM job_queue jq
                WHERE jq.type = 'draft_song.poll' AND jq.status IN ('pending','running')
                AND jq.payload LIKE '%' || ds.id || '%'
            )
        """).fetchall()
        if stuck:
            import json as _json
            now = int(time.time() * 1000)
            for s in stuck:
                _conn.execute(
                    "INSERT INTO job_queue (id, type, payload, status, scheduled_at, max_attempts) VALUES (?, 'draft_song.poll', ?, 'pending', ?, 5)",
                    (str(uuid.uuid4()), _json.dumps({'draft_song_ids': [s['id']], 'clip_ids': [s['suno_id']], 'account_id': 1, 'poll_count': 0}), now)
                )
            _conn.commit()
            logger.info(f"stuck processing songs {len(stuck)}개 → poll job 재생성")
        _conn.close()
    except Exception as e:
        logger.warning(f"stuck 복구 중 오류 (무시): {e}")

    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def on_signal():
        logger.info("종료 신호 수신. 현재 job 완료 후 종료...")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, on_signal)

    try:
        await dispatcher.run(shutdown_event)
    finally:
        release_pid_lock()
        logger.info("Worker Daemon 종료")


if __name__ == '__main__':
    asyncio.run(main())
