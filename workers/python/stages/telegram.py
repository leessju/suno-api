"""
Telegram 전송 Stage
"""
import logging
from workers.python.telegram.bot import send_message

logger = logging.getLogger('stages.telegram')


async def handle_telegram_send(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      chat_id: str
      text: str
      parse_mode: str (optional)
    """
    chat_id = payload.get('chat_id', '')
    text = payload.get('text', '')
    parse_mode = payload.get('parse_mode', 'HTML')

    if not chat_id or not text:
        logger.warning('chat_id 또는 text 누락')
        return

    success = await send_message(chat_id, text, parse_mode)
    logger.info(f"Telegram 전송: {'성공' if success else '실패'} → {chat_id}")
