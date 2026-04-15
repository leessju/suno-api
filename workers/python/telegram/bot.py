"""
Telegram Bot — 알림 + 투표 + 명령
"""

import asyncio
import logging
import os
import sqlite3
from pathlib import Path

logger = logging.getLogger('telegram.bot')

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')


async def send_message(chat_id: str, text: str, parse_mode: str = 'HTML') -> bool:
    """텔레그램 메시지 전송"""
    if not BOT_TOKEN:
        logger.warning('TELEGRAM_BOT_TOKEN 미설정 — 전송 스킵')
        return False

    try:
        import httpx
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                json={
                    'chat_id': chat_id,
                    'text': text,
                    'parse_mode': parse_mode,
                },
                timeout=10,
            )
            return res.status_code == 200
    except Exception as e:
        logger.error(f'Telegram 전송 실패: {e}')
        return False


async def send_approval_result(
    chat_id: str,
    track_title: str,
    verdict: str,
    avg_score: float,
    verdicts: list[dict],
) -> bool:
    """결재 결과 전송"""
    emoji = '✅' if verdict == 'approved' else '❌'
    text = f"""{emoji} <b>결재 완료</b>

<b>{track_title}</b>
결과: {verdict.upper()} (평균 {avg_score:.1f}점)

"""
    for v in verdicts:
        score_bar = '█' * int(v['score'] / 10) + '░' * (10 - int(v['score'] / 10))
        text += f"• {v['voter_name']}: {v['score']:.0f}점 [{score_bar}]\n"
        text += f"  {v['comment']}\n\n"

    return await send_message(chat_id, text)


async def send_pipeline_complete(
    chat_id: str,
    workspace_name: str,
    youtube_url: str | None = None,
) -> bool:
    """파이프라인 완료 알림"""
    text = f"""🎵 <b>파이프라인 완료</b>

<b>{workspace_name}</b>
"""
    if youtube_url:
        text += f'\n▶️ <a href="{youtube_url}">YouTube에서 보기</a>'

    return await send_message(chat_id, text)
