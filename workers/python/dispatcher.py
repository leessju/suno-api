"""
Job Dispatcher — SQLite job_queue 폴링 + 핸들러 라우팅
"""

import asyncio
import importlib
import json
import logging
import sqlite3
import time
from typing import Callable

logger = logging.getLogger('dispatcher')

# Job 타입 → 핸들러 매핑
JOB_HANDLERS: dict[str, str] = {
    'midi.convert': 'workers.python.stages.midi.handle_midi_convert',
    'variants.generate': 'workers.python.stages.variants.handle_variants_generate',
    'suno.generate': 'workers.python.stages.suno.handle_suno_generate',
    'suno.poll': 'workers.python.stages.suno.handle_suno_poll',
    'render.remotion': 'workers.python.stages.render.handle_render',
    'upload.youtube': 'workers.python.stages.upload.handle_youtube_upload',
    'approval.run': 'workers.python.stages.approval.handle_approval',
    'telegram.send': 'workers.python.stages.telegram.handle_telegram_send',
}


class Dispatcher:
    def __init__(self, db_path: str, poll_interval: float = 1.0):
        self.db_path = db_path
        self.poll_interval = poll_interval
        self._handlers: dict[str, Callable] = {}
        self._semaphore = asyncio.Semaphore(8)  # 최대 동시 실행

    def _get_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA busy_timeout=5000')
        return conn

    def _pick_job(self) -> dict | None:
        """pending job 1개 pick → running으로 변경"""
        conn = self._get_db()
        try:
            now = int(time.time() * 1000)
            row = conn.execute(
                """
                SELECT * FROM job_queue
                WHERE status = 'pending' AND scheduled_at <= ?
                ORDER BY scheduled_at ASC LIMIT 1
                """,
                (now,)
            ).fetchone()

            if not row:
                return None

            job = dict(row)
            updated = conn.execute(
                """
                UPDATE job_queue
                SET status = 'running', picked_at = ?, attempts = attempts + 1
                WHERE id = ? AND status = 'pending'
                """,
                (now, job['id'])
            ).rowcount
            conn.commit()

            if updated == 0:
                return None  # 경쟁 조건

            job['payload'] = json.loads(job['payload'])
            return job
        finally:
            conn.close()

    def _ack_job(self, job_id: str):
        """Job 완료"""
        conn = self._get_db()
        try:
            conn.execute(
                "UPDATE job_queue SET status = 'done', done_at = ? WHERE id = ?",
                (int(time.time() * 1000), job_id)
            )
            conn.commit()
        finally:
            conn.close()

    def _fail_job(self, job_id: str, error: str, attempts: int, max_attempts: int):
        """Job 실패 — 재시도 또는 failed"""
        conn = self._get_db()
        try:
            if attempts >= max_attempts:
                conn.execute(
                    "UPDATE job_queue SET status = 'failed', error = ?, done_at = ? WHERE id = ?",
                    (error[:2000], int(time.time() * 1000), job_id)
                )
            else:
                backoff_ms = min(1000 * (2 ** (attempts - 1)), 16000)
                next_scheduled = int(time.time() * 1000) + backoff_ms
                conn.execute(
                    "UPDATE job_queue SET status = 'pending', error = ?, scheduled_at = ? WHERE id = ?",
                    (error[:2000], next_scheduled, job_id)
                )
            conn.commit()
        finally:
            conn.close()

    async def _execute_job(self, job: dict):
        """Job 실행 + 결과 처리"""
        job_type = job['type']
        job_id = job['id']

        handler_path = JOB_HANDLERS.get(job_type)
        if not handler_path:
            self._fail_job(job_id, f"Unknown job type: {job_type}", job['attempts'], job['max_attempts'])
            return

        # 동적 임포트
        module_path, func_name = handler_path.rsplit('.', 1)
        try:
            module = importlib.import_module(module_path)
            handler = getattr(module, func_name)
        except (ImportError, AttributeError) as e:
            logger.error(f"Handler 로드 실패 [{job_type}]: {e}")
            self._fail_job(job_id, str(e), job['attempts'], job['max_attempts'])
            return

        async with self._semaphore:
            try:
                logger.info(f"Job 실행: {job_type} [{job_id[:8]}]")
                await handler(job['payload'], db_path=self.db_path)
                self._ack_job(job_id)
                logger.info(f"Job 완료: {job_type} [{job_id[:8]}]")
            except Exception as e:
                logger.error(f"Job 실패: {job_type} [{job_id[:8]}]: {e}")
                self._fail_job(job_id, str(e), job['attempts'], job['max_attempts'])

    async def run(self, shutdown_event: asyncio.Event):
        """메인 폴링 루프"""
        logger.info(f"Dispatcher 시작 (poll_interval={self.poll_interval}s, db={self.db_path})")

        tasks: set[asyncio.Task] = set()

        while not shutdown_event.is_set():
            job = self._pick_job()
            if job:
                task = asyncio.create_task(self._execute_job(job))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
            else:
                await asyncio.sleep(self.poll_interval)

        # 종료 시 실행 중인 task 완료 대기
        if tasks:
            logger.info(f"실행 중인 {len(tasks)}개 job 완료 대기...")
            await asyncio.gather(*tasks, return_exceptions=True)
