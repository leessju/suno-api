"""
Polymorphic Imagining Music — Python Worker Daemon
asyncio 기반 job 처리 루프 (단일 인스턴스 보장)
"""

import asyncio
import logging
import os
import signal
import sys
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
