"""
Polymorphic Imagining Music — Python Worker Daemon
asyncio 기반 job 처리 루프
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

from workers.python.dispatcher import Dispatcher

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('daemon')


async def main():
    logger.info("Python Worker Daemon 시작")

    db_path = os.environ.get('MUSIC_GEN_DB_PATH', './data/music-gen.db')
    poll_interval = float(os.environ.get('WORKER_POLL_INTERVAL', '1.0'))

    dispatcher = Dispatcher(db_path=db_path, poll_interval=poll_interval)

    # 시그널 핸들러
    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def on_signal():
        logger.info("종료 신호 수신. 현재 job 완료 후 종료...")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, on_signal)

    await dispatcher.run(shutdown_event)
    logger.info("Worker Daemon 종료")


if __name__ == '__main__':
    asyncio.run(main())
