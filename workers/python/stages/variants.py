"""
Variants 생성 Stage — P2에서 구현
현재: 스텁
"""
import logging

logger = logging.getLogger('stages.variants')


async def handle_variants_generate(payload: dict, db_path: str = './data/music-gen.db'):
    logger.info(f"[P2 미구현] variants.generate: {payload}")
    # TODO: P2에서 Gemini generator.ts 연동
