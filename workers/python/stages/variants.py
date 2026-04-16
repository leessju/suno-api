"""
Variants 생성 Stage — Gemini API를 사용해 음악 변형 프롬프트 생성
"""
import json
import logging
import os
import sqlite3
import time
import uuid

logger = logging.getLogger('stages.variants')

# Gemini 가격표 (USD per token)
GEMINI_PRICING = {
    "gemini-2.0-flash": {"input": 0.075 / 1_000_000, "output": 0.30 / 1_000_000},
    "gemini-2.5-flash": {"input": 0.075 / 1_000_000, "output": 0.30 / 1_000_000},
    "gemini-2.5-pro":   {"input": 1.25  / 1_000_000, "output": 10.0  / 1_000_000},
}

# google-generativeai 패키지 가용 여부 확인
try:
    import google.generativeai as genai
    _HAS_GENAI = True
except ImportError:
    _HAS_GENAI = False
    logger.warning("google-generativeai 미설치 — aiohttp REST fallback 사용")


def _build_prompt(style: str, title: str, original_prompt: str, count: int, original_ratio: int = 50) -> str:
    if original_ratio <= 30:
        ratio_desc = f"스타일 위주 (원곡 영향 최소화, 비율 {original_ratio}/100): 레퍼런스의 특성을 최소화하고 채널 고유 스타일 전면 적용."
    elif original_ratio <= 70:
        ratio_desc = f"균형 (원곡:스타일 동등 반영, 비율 {original_ratio}/100): 원곡 감정·BPM을 균형 있게 반영하되 채널 스타일로 재해석."
    else:
        ratio_desc = f"원곡 밀착 (비율 {original_ratio}/100): 원곡 감정·구조를 최대한 보존하되 채널 장르 안에서 표현."

    lines = [
        "당신은 K-pop/음악 프로듀서입니다.",
        f"다음 정보를 바탕으로 Suno AI 음악 생성용 프롬프트 {count}개를 만들어주세요.",
        "",
        f"스타일: {style}",
        f"원곡:스타일 비율 지침: {ratio_desc}",
    ]
    if title:
        lines.append(f"제목: {title}")
    if original_prompt:
        lines.append(f"기존 프롬프트: {original_prompt}")
    lines += [
        "",
        "각 변형은 서로 다른 감정/템포/악기 조합을 가져야 합니다.",
        "JSON 배열로만 반환하세요 (다른 텍스트 없이):",
        '[',
        '  {"variant_index": 1, "title": "...", "style_tags": "...", "prompt": "..."},',
        '  ...',
        ']',
    ]
    return "\n".join(lines)


async def _call_genai(prompt: str, model_name: str, api_key: str) -> dict:
    """google-generativeai SDK를 사용한 Gemini 호출."""
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.9,
            response_mime_type="application/json",
        ),
    )
    text = response.text
    usage = response.usage_metadata
    return {
        "text": text,
        "input_tokens": getattr(usage, "prompt_token_count", 0),
        "output_tokens": getattr(usage, "candidates_token_count", 0),
    }


async def _call_rest(prompt: str, model_name: str, api_key: str) -> dict:
    """aiohttp를 사용한 Gemini REST API 직접 호출 (fallback)."""
    import aiohttp

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models"
        f"/{model_name}:generateContent?key={api_key}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.9,
            "responseMimeType": "application/json",
        },
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=body) as resp:
            resp.raise_for_status()
            data = await resp.json()

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    usage = data.get("usageMetadata", {})
    return {
        "text": text,
        "input_tokens": usage.get("promptTokenCount", 0),
        "output_tokens": usage.get("candidatesTokenCount", 0),
    }


async def generate_variants(
    style: str,
    title: str,
    original_prompt: str,
    count: int,
    model_name: str,
    api_key: str,
    original_ratio: int = 50,
) -> tuple[list[dict], int, int]:
    """
    Gemini로 count개의 변형 프롬프트를 생성합니다.
    반환: (variants_list, input_tokens, output_tokens)
    """
    prompt = _build_prompt(style, title, original_prompt, count, original_ratio)

    if _HAS_GENAI:
        result = await _call_genai(prompt, model_name, api_key)
    else:
        result = await _call_rest(prompt, model_name, api_key)

    text = result["text"].strip()
    # JSON 펜스 블록 제거
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(
            line for line in lines
            if not line.strip().startswith("```")
        )

    parsed = json.loads(text)
    if not isinstance(parsed, list):
        raise ValueError(f"Gemini 응답이 배열이 아닙니다: {type(parsed)}")

    variants = []
    for item in parsed[:count]:
        variant_id = str(uuid.uuid4())
        variants.append({
            "variant_id": variant_id,
            "title": item.get("title", title),
            "prompt": item.get("prompt", ""),
            "style_tags": item.get("style_tags", style),
            "variant_index": item.get("variant_index", len(variants) + 1),
        })

    return variants, result["input_tokens"], result["output_tokens"]


async def handle_variants_generate(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      style: str              — 음악 스타일 (예: "k-pop, upbeat")
      title: str              — 원본 제목
      original_prompt: str   — 기존 프롬프트/가사 (선택)
      count: int              — 생성할 변형 수 (기본 5)
    """
    workspace_id = payload["workspace_id"]
    workspace_midi_id = payload.get("workspace_midi_id")
    style = payload.get("style", "pop")
    title = payload.get("title", "")
    original_prompt = payload.get("original_prompt", "")
    count = int(payload.get("count", 5))
    original_ratio = int(payload.get("original_ratio", 50))

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("VERTEX_AI_API_KEY", "")
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

    # Vertex AI에서 미지원 모델명 매핑 (account-pool.ts와 동일)
    MODEL_ALIAS = {
        "gemini-3-flash-preview": "gemini-2.5-flash",
        "gemini-3-pro-preview": "gemini-2.5-pro",
    }
    model_name = MODEL_ALIAS.get(model_name, model_name)

    if not api_key:
        raise ValueError("GEMINI_API_KEY 또는 VERTEX_AI_API_KEY 환경변수가 설정되지 않았습니다.")

    logger.info(
        f"variants.generate 시작: workspace={workspace_id}, "
        f"style={style!r}, count={count}, model={model_name}"
    )

    variants, input_tokens, output_tokens = await generate_variants(
        style, title, original_prompt, count, model_name, api_key, original_ratio
    )

    pricing = GEMINI_PRICING.get(model_name, GEMINI_PRICING["gemini-2.0-flash"])
    cost_usd = (
        input_tokens * pricing["input"] + output_tokens * pricing["output"]
    )

    conn = sqlite3.connect(db_path)
    try:
        now = int(time.time() * 1000)

        # 각 variant를 workspace_tracks에 저장
        for v in variants:
            conn.execute(
                """
                INSERT INTO workspace_tracks
                    (workspace_id, suno_track_id, variant_id, suno_account_id, workspace_midi_id)
                VALUES (?, ?, ?, NULL, ?)
                """,
                (workspace_id, v["variant_id"], v["variant_id"], workspace_midi_id),
            )

        # LLM 사용량 기록
        usage_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO gem_llm_usage
                (id, workspace_id, session_id, provider, model,
                 input_tokens, output_tokens, cost_usd, ts)
            VALUES (?, ?, NULL, 'gemini', ?, ?, ?, ?, ?)
            """,
            (
                usage_id,
                workspace_id,
                model_name,
                input_tokens,
                output_tokens,
                cost_usd,
                now,
            ),
        )

        conn.commit()
        logger.info(
            f"variants 저장 완료: {len(variants)}개, "
            f"tokens={input_tokens}+{output_tokens}, cost=${cost_usd:.6f}"
        )
    finally:
        conn.close()

    return {
        "workspace_id": workspace_id,
        "variants": variants,
        "model": model_name,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost_usd,
    }
