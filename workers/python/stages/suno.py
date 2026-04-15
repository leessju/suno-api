"""
Suno 생성 Stage — P2에서 구현
"""
import logging

logger = logging.getLogger('stages.suno')


async def handle_suno_generate(payload: dict, db_path: str = './data/music-gen.db'):
    logger.info(f"[P2 미구현] suno.generate: {payload}")


async def handle_suno_poll(payload: dict, db_path: str = './data/music-gen.db'):
    logger.info(f"[P2 미구현] suno.poll: {payload}")
