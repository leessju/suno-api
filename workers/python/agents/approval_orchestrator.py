"""
결재 Orchestrator — Claude Agent SDK 기반 4 persona 토론
"""

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from dataclasses import dataclass, asdict

logger = logging.getLogger('agents.approval')

PERSONAS = [
    {
        'id': 'melody_critic',
        'name': 'Melody Critic',
        'focus': '멜로디/후크 품질',
        'prompt': '당신은 멜로디와 후크 품질을 평가하는 전문가입니다. 기억에 남는 멜로디, 강렬한 후크, 음악적 독창성을 중심으로 평가하세요.',
    },
    {
        'id': 'production_judge',
        'name': 'Production Judge',
        'focus': '믹싱/음질',
        'prompt': '당신은 프로덕션과 믹싱 품질을 평가하는 전문가입니다. 사운드 밸런스, 클리어리티, 다이나믹 레인지를 평가하세요.',
    },
    {
        'id': 'lyric_analyst',
        'name': 'Lyric Analyst',
        'focus': '가사/라임/감정',
        'prompt': '당신은 가사와 감성적 임팩트를 평가하는 전문가입니다. 라임 구조, 스토리텔링, 감정 전달력을 평가하세요.',
    },
    {
        'id': 'genre_purist',
        'name': 'Genre Purist',
        'focus': '장르 정합성',
        'prompt': '당신은 장르 일관성과 스타일 적합성을 평가하는 전문가입니다. 장르 관습 준수, 타깃 청중 적합성을 평가하세요.',
    },
]


@dataclass
class PersonaVerdict:
    voter_id: str
    voter_name: str
    score: float        # 0~100
    verdict: str        # 'approve' | 'reject' | 'abstain'
    comment: str


async def evaluate_with_persona(
    persona: dict,
    track_info: dict,
    model: str = 'claude-haiku-4-5',
) -> PersonaVerdict:
    """단일 persona 평가"""

    system_prompt = f"""{persona['prompt']}

평가 기준: {persona['focus']}

다음 JSON 형식으로만 응답하세요:
{{
  "score": <0-100 숫자>,
  "verdict": "<approve|reject|abstain>",
  "comment": "<한국어로 간략한 평가 이유>"
}}
"""

    user_message = f"""다음 음악을 평가해주세요:

제목: {track_info.get('title', 'Unknown')}
스타일: {track_info.get('style', '')}
가사: {track_info.get('lyrics', '')[:500]}

approve 기준: 점수 70점 이상
reject 기준: 점수 50점 미만
abstain: 판단 보류"""

    try:
        import anthropic
        client = anthropic.Anthropic()

        response = client.messages.create(
            model=model,
            max_tokens=256,
            system=system_prompt,
            messages=[{'role': 'user', 'content': user_message}],
        )

        text = response.content[0].text.strip()
        # JSON 파싱
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]

        data = json.loads(text)

        # LLM 비용 기록을 위한 토큰 정보
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        logger.info(f"[{persona['name']}] tokens: in={input_tokens}, out={output_tokens}")

        return PersonaVerdict(
            voter_id=persona['id'],
            voter_name=persona['name'],
            score=float(data.get('score', 50)),
            verdict=data.get('verdict', 'abstain'),
            comment=data.get('comment', ''),
        )
    except Exception as e:
        logger.error(f"[{persona['name']}] 평가 실패: {e}")
        return PersonaVerdict(
            voter_id=persona['id'],
            voter_name=persona['name'],
            score=50.0,
            verdict='abstain',
            comment=f'평가 실패: {str(e)[:100]}',
        )


async def run_approval(
    session_id: str,
    track_info: dict,
    db_path: str = './data/music-gen.db',
) -> dict:
    """
    4 persona 병렬 평가 → 합의 결정
    Returns: { verdict: 'approved'|'rejected', score: float, verdicts: [...] }
    """
    logger.info(f"결재 시작: session={session_id}, track={track_info.get('title', '?')}")

    # 4 persona 병렬 평가
    tasks = [
        evaluate_with_persona(persona, track_info)
        for persona in PERSONAS
    ]
    results = await asyncio.gather(*tasks)

    # DB에 투표 저장
    conn = sqlite3.connect(db_path)
    try:
        now = int(time.time() * 1000)
        for r in results:
            conn.execute(
                """
                INSERT INTO approval_votes (session_id, voter_type, voter_id, score, verdict, comment, ts)
                VALUES (?, 'agent', ?, ?, ?, ?, ?)
                """,
                (session_id, r.voter_id, r.score, r.verdict, r.comment, now)
            )
        conn.commit()
    finally:
        conn.close()

    # 합의 계산
    scores = [r.score for r in results]
    avg_score = sum(scores) / len(scores)
    approve_count = sum(1 for r in results if r.verdict == 'approve')
    reject_count = sum(1 for r in results if r.verdict == 'reject')

    # 과반수 approve OR 평균 점수 70+ → 승인
    final_verdict = 'approved' if (approve_count >= 2 and avg_score >= 65) else 'rejected'

    logger.info(f"결재 완료: {final_verdict} (avg={avg_score:.1f}, approve={approve_count}/4)")

    return {
        'verdict': final_verdict,
        'avg_score': avg_score,
        'approve_count': approve_count,
        'verdicts': [asdict(r) for r in results],
    }
