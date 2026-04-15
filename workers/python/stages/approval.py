"""
결재 Stage — Claude Agent SDK 4-persona 토론
"""

import asyncio
import logging
import sqlite3
import time
import uuid

from workers.python.agents.approval_orchestrator import run_approval

logger = logging.getLogger('stages.approval')


async def handle_approval(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      suno_track_id: str
      title: str (optional)
      style: str (optional)
      lyrics: str (optional)
    """
    workspace_id = payload['workspace_id']
    suno_track_id = payload['suno_track_id']

    # 결재 세션 생성
    session_id = str(uuid.uuid4())
    now = int(time.time() * 1000)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO approval_sessions (id, track_id, workspace_id, status, started_at)
            VALUES (?, ?, ?, 'pending', ?)
            """,
            (session_id, suno_track_id, workspace_id, now)
        )
        conn.commit()
    finally:
        conn.close()

    track_info = {
        'title': payload.get('title', suno_track_id),
        'style': payload.get('style', ''),
        'lyrics': payload.get('lyrics', ''),
    }

    result = await run_approval(session_id, track_info, db_path)

    # 결재 세션 업데이트
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            UPDATE approval_sessions
            SET status = ?, concluded_at = ?, final_verdict = ?
            WHERE id = ?
            """,
            (result['verdict'], int(time.time() * 1000), str(result), session_id)
        )
        conn.commit()
    finally:
        conn.close()

    logger.info(f"결재 완료: {result['verdict']} (score={result['avg_score']:.1f})")
    return result
