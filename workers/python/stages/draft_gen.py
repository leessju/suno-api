"""
MIDI Draft 생성 Stage — variants API를 호출하고 draft_row 업데이트
"""
import json
import logging
import os
import sqlite3
import time

logger = logging.getLogger('stages.draft_gen')


async def handle_midi_draft_generate(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      workspace_midi_id: str
      draft_row_id: str
    """
    import aiohttp

    workspace_id = payload['workspace_id']
    workspace_midi_id = payload['workspace_midi_id']
    draft_row_id = payload['draft_row_id']

    base_url = os.environ.get('NEXTJS_INTERNAL_BASE', 'http://localhost:3000')
    url = f"{base_url}/api/music-gen/workspaces/{workspace_id}/variants"

    logger.info(f"midi_draft.generate 시작: draft_row_id={draft_row_id[:8]}")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={'emotion_input': ''},
                headers={'Content-Type': 'application/json'},
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()

        content = data.get('data', {}).get('content') or data.get('content') or {}
        prompts: list = content.get('suno_style_prompts') or []

        _update_draft_row(
            db_path=db_path,
            draft_row_id=draft_row_id,
            patch={
                'title_en': content.get('title_en', ''),
                'title_jp': content.get('title_jp', ''),
                'lyrics': content.get('lyrics', ''),
                'narrative': content.get('narrative', ''),
                'suno_style_prompts': json.dumps(prompts, ensure_ascii=False),
                'selected_style': prompts[0] if prompts else '',
                'status': 'ready',
                'error_msg': None,
            },
        )
        logger.info(f"midi_draft.generate 완료: draft_row_id={draft_row_id[:8]}")

    except Exception as e:
        error_msg = str(e)[:2000]
        logger.error(f"midi_draft.generate 실패: draft_row_id={draft_row_id[:8]}: {error_msg}")
        _update_draft_row(
            db_path=db_path,
            draft_row_id=draft_row_id,
            patch={'status': 'error', 'error_msg': error_msg},
        )
        raise


def _update_draft_row(db_path: str, draft_row_id: str, patch: dict):
    """midi_draft_rows 테이블 직접 업데이트."""
    if not patch:
        return

    set_clauses = ', '.join(f'{k} = ?' for k in patch)
    values = list(patch.values()) + [int(time.time() * 1000), draft_row_id]

    conn = sqlite3.connect(db_path)
    try:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA busy_timeout=5000')
        conn.execute(
            f'UPDATE midi_draft_rows SET {set_clauses}, updated_at = ? WHERE id = ?',
            values,
        )
        conn.commit()
    finally:
        conn.close()
