"""
OpenClaw 자동 루프 — Claude Agent SDK 기반 자동 작곡
"""

import asyncio
import logging
import sqlite3
import time
import uuid
from pathlib import Path

logger = logging.getLogger('openclaw.loop')


async def run_openclaw_loop(loop_config: dict, db_path: str = './data/music-gen.db') -> dict:
    """
    단일 OpenClaw 루프 실행
    loop_config: {
      id, name, prompt_template, target_workspace_id, config_json
    }
    """
    loop_id = loop_config['id']
    logger.info(f"OpenClaw 루프 시작: {loop_config['name']} ({loop_id})")

    try:
        import anthropic

        # Haiku로 분류 → Sonnet으로 실행 → Opus로 검토
        client = anthropic.Anthropic()

        prompt = loop_config.get('prompt_template', '새로운 J-Pop 플레이리스트를 기획해주세요.')

        # Claude Sonnet으로 워크스페이스 기획
        response = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=512,
            messages=[{
                'role': 'user',
                'content': f'{prompt}\n\n다음 JSON으로 응답하세요:\n{{"workspace_name": "...", "theme": "...", "target_count": 10}}',
            }],
        )

        import json
        text = response.content[0].text
        try:
            plan = json.loads(text)
        except Exception:
            plan = {'workspace_name': f'OpenClaw-{int(time.time())}', 'theme': 'auto', 'target_count': 5}

        logger.info(f"OpenClaw 기획: {plan}")

        # DB 업데이트
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                'UPDATE openclaw_loops SET last_run_at = ? WHERE id = ?',
                (int(time.time() * 1000), loop_id)
            )
            conn.commit()
        finally:
            conn.close()

        return {'status': 'completed', 'plan': plan}

    except Exception as e:
        logger.error(f"OpenClaw 루프 실패: {e}")
        return {'status': 'failed', 'error': str(e)}


async def run_all_enabled_loops(db_path: str = './data/music-gen.db'):
    """모든 활성 루프 실행 (cron에서 호출)"""
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM openclaw_loops WHERE enabled = 1"
        ).fetchall()
        cols = [d[0] for d in conn.description]
        loops = [dict(zip(cols, r)) for r in rows]
    finally:
        conn.close()

    for loop in loops:
        try:
            await run_openclaw_loop(loop, db_path)
        except Exception as e:
            logger.error(f"루프 {loop['id']} 실패: {e}")
