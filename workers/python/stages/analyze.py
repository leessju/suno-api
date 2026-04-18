"""
MIDI 분석 Stage
mp3 파일을 Gemini / Vertex AI에 inline base64로 전송하여 오디오 분석.

TypeScript account-pool.ts의 동작을 Python으로 동일하게 재현:
- gemini-api  : google.generativeai SDK + API key
- vertex-ai   : REST API + google-auth 서비스 계정 토큰
- vertex-ai-apikey : REST API + API key (Vertex AI endpoint)

파일은 Files API 대신 inline base64로 전송 (Vertex AI는 Files API 미지원).
"""

import asyncio
import base64
import json
import logging
import os
import sqlite3
import subprocess
import time
from pathlib import Path

logger = logging.getLogger('stages.analyze')

ROOT = Path(__file__).parent.parent.parent.parent  # 프로젝트 루트
CONFIG_PATH = ROOT / 'config' / 'accounts.json'

MAX_INLINE_MB = 20

# ── 프롬프트 (analyzer.ts와 동일) ────────────────────────────────────────────

ANALYSIS_SYSTEM_INSTRUCTION = """
[Role]
너는 음악 제작 공정의 첫 번째 단계인 '미디 구조 분석 전문가'이다.
제공된 오디오 파일의 사운드를 분석하여, 향후 작사가와 작곡가가 참고할 수 있는 정밀한 음악적 명세서(Specification)를 작성하라.

[Analysis Order — 반드시 이 순서로 판단하라]
Step 1. 악기 인식 먼저: 들리는 악기가 무엇인지 먼저 판단하라. 피아노이면 클래식/발라드 계열을, 드럼+기타이면 록/팝 계열을 기준으로 설정하라.
Step 2. BPM 측정: 실제 비트/타격음의 간격을 기준으로 BPM을 측정하라. 아르페지오(음표가 빠르게 쏟아지는 패턴)는 BPM이 아니라 연주 기법이다. Double-time 오류 주의: BPM 80의 8분음표를 BPM 160의 4분음표로 착각하지 마라.
Step 3. 에너지 레벨: 악기 편성과 실제 음량·밀도를 기준으로 1~10을 판단하라. 피아노 솔로라면 최대 6이다.
Step 4. 구조·코드 분석: 시간대별 변화를 우선순위에 두고, 코드는 완전한 재즈 보이싱으로 표기하라 (Fmaj7, G6, Em7 등. 단순 "F" 금지).

[Anti-Hallucination 경고]
- 분석은 반드시 첨부된 파일의 실제 청각적 데이터에만 기반해야 한다.
- 이 프롬프트에 명시된 어떤 수치나 장르 단어도 예시일 뿐이다. 실제 파일과 다르면 무시하라.
- 파일에서 피아노 아르페지오가 들리면 BPM과 에너지를 낮게 측정하라.
- 존재하지 않는 악기, 래핑, 노이즈를 만들어내지 마라.

[Constraints]
- 가사를 직접 작성하지 마라.
- Suno 스타일 태그를 만들지 마라.
- 오로지 음악적 구조와 데이터 분석 결과만 출력하라.
- 출력은 반드시 JSON 형식이어야 한다.
""".strip()

ANALYSIS_PROMPT = """
아래 JSON 형식으로 분석 결과를 출력하라. 모든 수치와 내용은 실제 오디오 파일을 듣고 측정한 값이어야 한다.

{
  "key": "실제 측정한 조성",
  "tempo_bpm": <실제 측정한 BPM>,
  "duration_seconds": <실제 길이(초)>,
  "time_signature": "실제 박자",
  "energy_level": <실제 에너지 1~10>,
  "song_sections": [
    {
      "name": "Intro / Verse / Pre-Chorus / Chorus / Bridge / Solo / Outro 중 실제 해당",
      "start_time": <실제 시작 시간(초)>,
      "end_time": <실제 종료 시간(초)>,
      "bars": <실제 마디 수>,
      "energy": <이 섹션의 실제 에너지 1~10>,
      "characteristics": "이 섹션의 실제 반주 패턴, 음역대, 밀도 특징"
    }
  ],
  "notes_per_bar_avg": <실제 멜로디 기준 마디당 평균 음표 수>,
  "syllables_per_bar_min": <최소 권장 음절>,
  "syllables_per_bar_max": <최대 권장 음절>,
  "lyric_density_recommendation": "실제 측정된 여백/밀도에 근거한 가사 작성 권장사항",
  "chord_progression": ["실제 버스 코드 — 완전한 재즈 보이싱"],
  "chord_progression_chorus": ["실제 코러스 코드"],
  "chord_progression_confidence": <0.0~1.0>,
  "chord_character": "실제 코드 진행의 성격",
  "emotional_change": "실제 감정 변화 아크",
  "vocal_range_expected": "Low / Mid / High / Mid-High 중 실제 해당",
  "accent_position": "정박 중심 / 엇박 중심 / 혼합 중 실제 해당",
  "vocal_recommendation": "실제 곡 특성에 맞는 보컬 방향 권장",
  "mood": ["실제 분위기 키워드"],
  "emotional_keywords": ["실제 감성 키워드"],
  "instrumentation": ["실제 들리는 악기만 기재"],
  "notes": "실제 프로덕션·믹싱 특이사항",
  "lyric_structure_guide": [
    {
      "section_name": "위 song_sections의 name과 동일",
      "time_range": "MM:SS ~ MM:SS",
      "bars": <마디 수>,
      "energy": <에너지>,
      "harmonic_character": "화성 텐션·밀도·움직임",
      "syllables_per_bar": "N~N",
      "lyric_style": "독백/배경설명 | 감정변화/기대감 | 핵심주제/감정폭발 중 실제 해당",
      "lyric_note": "예시 구"
    }
  ]
}
""".strip()

# Vertex AI에서 사용 불가한 모델 → 대체 모델 매핑 (account-pool.ts와 동일)
VERTEX_AI_FALLBACK = {
    'gemini-3-pro-preview':     'gemini-2.5-pro',
    'gemini-3-flash-preview':   'gemini-2.5-flash',
    'gemini-3.0-flash-preview': 'gemini-2.5-flash',
}
DEFAULT_MODEL = 'gemini-2.5-flash'


# ── 계정 로드 ──────────────────────────────────────────────────────────────────

def _load_accounts() -> list[dict]:
    config_path = Path(os.environ.get('MUSIC_GEN_ACCOUNTS_PATH', str(CONFIG_PATH)))
    if config_path.exists():
        data = json.loads(config_path.read_text())
        accounts = data.get('accounts', [])
        if accounts:
            return accounts

    api_key = os.environ.get('GEMINI_API_KEY', '')
    if api_key:
        return [{'type': 'gemini-api', 'name': 'default', 'apiKey': api_key}]

    raise RuntimeError(
        'Gemini 계정 설정 없음. config/accounts.json 또는 GEMINI_API_KEY 환경변수를 설정하세요.'
    )


# ── Vertex AI 액세스 토큰 ─────────────────────────────────────────────────────

_token_cache: dict[str, tuple[str, float]] = {}  # path → (token, expires_at)


def _get_vertex_access_token(credentials_path: str) -> str:
    cached = _token_cache.get(credentials_path)
    if cached and cached[1] - time.time() > 300:
        return cached[0]

    from google.oauth2 import service_account  # noqa: PLC0415
    from google.auth.transport.requests import Request  # noqa: PLC0415

    creds = service_account.Credentials.from_service_account_file(
        credentials_path,
        scopes=['https://www.googleapis.com/auth/cloud-platform'],
    )
    creds.refresh(Request())
    token = creds.token
    _token_cache[credentials_path] = (token, time.time() + 55 * 60)
    return token


# ── 계정별 Gemini 호출 ────────────────────────────────────────────────────────

def _call_gemini_api(account: dict, audio_b64: str, model: str) -> str:
    """gemini-api 계정: google.genai SDK + inline base64"""
    from google import genai  # noqa: PLC0415
    from google.genai import types  # noqa: PLC0415

    client = genai.Client(api_key=account['apiKey'])
    response = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=base64.b64decode(audio_b64), mime_type='audio/mpeg'),
            ANALYSIS_PROMPT,
        ],
        config=types.GenerateContentConfig(
            system_instruction=ANALYSIS_SYSTEM_INSTRUCTION,
            temperature=0,
            response_mime_type='application/json',
        ),
    )
    return response.text


def _call_vertex_rest(
    project: str,
    location: str,
    model: str,
    auth_header: str,
    audio_b64: str,
) -> str:
    """Vertex AI REST API — inline base64 (Files API 미지원)"""
    import urllib.request  # noqa: PLC0415

    # Vertex AI fallback 모델 적용
    resolved_model = VERTEX_AI_FALLBACK.get(model, model)
    url = (
        f'https://{location}-aiplatform.googleapis.com/v1/'
        f'projects/{project}/locations/{location}/'
        f'publishers/google/models/{resolved_model}:generateContent'
    )

    body = {
        'systemInstruction': {'parts': [{'text': ANALYSIS_SYSTEM_INSTRUCTION}]},
        'contents': [
            {
                'role': 'user',
                'parts': [
                    {'inlineData': {'data': audio_b64, 'mimeType': 'audio/mpeg'}},
                    {'text': ANALYSIS_PROMPT},
                ],
            }
        ],
        'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json'},
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={'Authorization': auth_header, 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())

    return result['candidates'][0]['content']['parts'][0]['text']


def _is_rate_limit(err: Exception) -> bool:
    msg = str(err).lower()
    return any(k in msg for k in ('429', 'resource_exhausted', 'rate limit', 'quota'))


# ── Essentia BPM 감지 ────────────────────────────────────────────────────────

BPM_SCRIPT = ROOT / 'scripts' / 'bpm_detect.mjs'


async def _detect_bpm_essentia(mp3_path: str) -> float | None:
    """node scripts/bpm_detect.mjs로 Essentia BPM 감지."""
    try:
        proc = await asyncio.create_subprocess_exec(
            'node', str(BPM_SCRIPT), mp3_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        if proc.returncode == 0:
            data = json.loads(stdout.decode())
            bpm = data.get('bpm')
            logger.info(f"Essentia BPM: {bpm}")
            return float(bpm) if bpm is not None else None
        else:
            logger.warning(f"Essentia BPM 실패: {stderr.decode()[:200]}")
            return None
    except Exception as e:
        logger.warning(f"Essentia BPM 오류: {e}")
        return None


# ── Gemini 오디오 분석 (계정 로테이션) ────────────────────────────────────────

async def _trim_audio_if_needed(mp3_path: str) -> tuple[str, bool]:
    """20MB 초과 시 ffmpeg로 첫 90초를 임시 파일로 트리밍. (trimmed_path, is_temp) 반환."""
    size_mb = Path(mp3_path).stat().st_size / (1024 * 1024)
    if size_mb <= MAX_INLINE_MB:
        return mp3_path, False

    import tempfile  # noqa: PLC0415
    tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    tmp.close()
    logger.info(f"파일 크기 {size_mb:.1f} MB > {MAX_INLINE_MB} MB — 첫 90초로 트리밍")
    proc = await asyncio.create_subprocess_exec(
        'ffmpeg', '-y', '-i', mp3_path, '-t', '90', '-q:a', '0', tmp.name,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.communicate()
    if proc.returncode != 0:
        import os as _os; _os.unlink(tmp.name)  # noqa: E702
        raise RuntimeError(f'ffmpeg 트리밍 실패 (exit={proc.returncode})')
    return tmp.name, True


async def _analyze_audio_with_gemini(mp3_path: str) -> dict:
    accounts = _load_accounts()
    trimmed_path, is_temp = await _trim_audio_if_needed(mp3_path)
    try:
        audio_bytes = Path(trimmed_path).read_bytes()
    finally:
        if is_temp:
            import os as _os; _os.unlink(trimmed_path)  # noqa: E702
    size_mb = len(audio_bytes) / (1024 * 1024)
    if size_mb > MAX_INLINE_MB:
        raise RuntimeError(f'트리밍 후에도 파일 크기 초과: {size_mb:.1f} MB > {MAX_INLINE_MB} MB')

    audio_b64 = base64.b64encode(audio_bytes).decode()
    model = os.environ.get('GEMINI_MODEL', DEFAULT_MODEL)

    rate_limited_until: dict[str, float] = {}
    idx = 0

    for attempt in range(len(accounts)):
        account = accounts[idx % len(accounts)]
        name = account.get('name', str(idx))

        if rate_limited_until.get(name, 0) > time.time():
            idx += 1
            continue

        try:
            logger.info(f"Gemini 분석 요청 — 계정={name}, 모델={model}")
            atype = account.get('type')

            if atype == 'gemini-api':
                raw = _call_gemini_api(account, audio_b64, model)

            elif atype == 'vertex-ai-apikey':
                raw = _call_vertex_rest(
                    project=account['project'],
                    location=account.get('location', 'us-central1'),
                    model=model,
                    auth_header=f"x-goog-api-key {account['apiKey']}",
                    audio_b64=audio_b64,
                )

            elif atype == 'vertex-ai':
                token = _get_vertex_access_token(account['credentialsPath'])
                raw = _call_vertex_rest(
                    project=account['project'],
                    location=account.get('location', 'us-central1'),
                    model=model,
                    auth_header=f'Bearer {token}',
                    audio_b64=audio_b64,
                )

            else:
                raise RuntimeError(f'알 수 없는 계정 타입: {atype}')

            # JSON 코드블록 제거
            text = raw.strip()
            if text.startswith('```'):
                text = text.split('\n', 1)[1] if '\n' in text else text
                text = text.rsplit('```', 1)[0].strip()

            return json.loads(text)

        except Exception as e:
            if _is_rate_limit(e):
                logger.warning(f"Rate limit — 계정={name}: {e}")
                rate_limited_until[name] = time.time() + 60
                idx += 1
                continue
            raise

    raise RuntimeError('모든 Gemini 계정이 rate limit 상태입니다.')


# ── 핸들러 ────────────────────────────────────────────────────────────────────

async def handle_midi_analyze(payload: dict, db_path: str = './data/music-gen.db'):
    """
    payload:
      workspace_id: str
      workspace_midi_id: str
      midi_path: str
      mp3_path: str
    """
    workspace_midi_id = payload['workspace_midi_id']
    mp3_path = payload.get('mp3_path', '')

    logger.info(f"MIDI 분석 시작: midi_id={workspace_midi_id}, mp3={mp3_path}")

    # 분석 시작 시 status → analyzing
    _conn = sqlite3.connect(db_path)
    try:
        _conn.execute(
            "UPDATE workspace_midis SET status = 'analyzing', updated_at = ? WHERE id = ?",
            (int(time.time() * 1000), workspace_midi_id)
        )
        _conn.commit()
    finally:
        _conn.close()

    analysis: dict = {}
    error_msg: str | None = None
    mp3_exists = bool(mp3_path) and Path(mp3_path).exists()

    if mp3_exists:
        # Gemini 분석 + Essentia BPM 병렬 실행
        gemini_task = asyncio.create_task(_analyze_audio_with_gemini(mp3_path))
        essentia_task = asyncio.create_task(_detect_bpm_essentia(mp3_path))

        try:
            analysis = await gemini_task
            logger.info(f"Gemini 분석 완료: bpm={analysis.get('tempo_bpm')}, key={analysis.get('key')}")
        except Exception as e:
            logger.error(f"Gemini 분석 실패: {e}")
            error_msg = str(e)[:500]

        # Essentia BPM으로 덮어쓰기 (더 정확)
        essentia_bpm = await essentia_task
        if essentia_bpm is not None:
            analysis['tempo_bpm'] = essentia_bpm
            logger.info(f"BPM 교체: Gemini → Essentia ({essentia_bpm})")
    else:
        logger.warning(f"MP3 파일 없음: {mp3_path} — 분석 없이 ready로 전환")

    # DB 업데이트
    now = int(time.time() * 1000)
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            'SELECT midi_master_id FROM workspace_midis WHERE id = ?',
            (workspace_midi_id,),
        ).fetchone()
        midi_master_id = row[0] if row else None

        if midi_master_id and analysis:
            master_sets: list[str] = []
            master_vals: list = []

            bpm = analysis.get('tempo_bpm')
            if bpm is not None:
                master_sets.append('bpm = ?')
                master_vals.append(float(bpm))

            key = analysis.get('key')
            if key:
                master_sets.append('key_signature = ?')
                master_vals.append(str(key))

            chord_progression = analysis.get('chord_progression')
            if chord_progression:
                master_sets.append('chord_json = ?')
                master_vals.append(json.dumps(chord_progression, ensure_ascii=False))

            # 전체 분석 결과 저장
            master_sets.append('analysis_json = ?')
            master_vals.append(json.dumps(analysis, ensure_ascii=False))

            if master_sets:
                master_vals.append(midi_master_id)
                conn.execute(
                    f"UPDATE midi_masters SET {', '.join(master_sets)} WHERE id = ?",
                    master_vals,
                )

        if error_msg and mp3_exists:
            conn.execute(
                "UPDATE workspace_midis SET status = 'error', error_message = ?, updated_at = ? WHERE id = ?",
                (error_msg, now, workspace_midi_id),
            )
        else:
            conn.execute(
                "UPDATE workspace_midis SET status = 'ready', updated_at = ? WHERE id = ?",
                (now, workspace_midi_id),
            )

        conn.commit()
        logger.info(f"MIDI 분석 DB 업데이트 완료: midi_id={workspace_midi_id}")
    except Exception as e:
        conn.execute(
            "UPDATE workspace_midis SET status = 'error', error_message = ?, updated_at = ? WHERE id = ?",
            (str(e)[:500], now, workspace_midi_id),
        )
        conn.commit()
        raise
    finally:
        conn.close()

    return {'workspace_midi_id': workspace_midi_id, 'bpm': analysis.get('tempo_bpm')}
