# Music-Gen 분석 파이프라인 설계 문서

작성일: 2026-04-14  
작업 세션: Gemini 오디오 분석 → 가사 생성 파이프라인 구축

---

## 개요

MP3/MIDI 파일을 업로드하면 Gemini가 음악 구조를 분석하고, 그 결과를 가사 생성에 활용하는 파이프라인.

---

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `src/lib/music-gen/media/analyzer.ts` | 오디오 분석 (Gemini multimodal) |
| `src/lib/music-gen/gemini/account-pool.ts` | Gemini API 계정 풀 관리 |
| `src/lib/music-gen/gemini/generator.ts` | 가사·제목·Suno 스타일 생성 |
| `src/lib/music-gen/gemini/prompt-builder.ts` | 분석 결과 → 가사 생성 프롬프트 조립 |
| `src/lib/music-gen/context/assembler.ts` | 세션 컨텍스트 조립 (mediaAnalysis 포함) |
| `config/accounts.json` | Gemini API 계정 설정 |

---

## Gemini 모델 설정

```
모델: gemini-3-flash-preview  (Gemini Developer API)
temperature: 0
thinkingBudget: 24576  (AI Studio "High" 수준)
```

### 계정 구성 (`config/accounts.json`)

```json
{
  "accounts": [
    { "type": "gemini-api", "name": "gemini-api-primary", "apiKey": "..." }
  ]
}
```

**`vertex-ai-apikey` 타입**: `vertexai:true + apiKey` 조합으로 정상 동작 확인됨. `gemini-3-flash-preview`는 Vertex AI 엔드포인트에서 404 → `gemini-2.5-flash`로 자동 폴백됨.  
Vertex AI (`vertex-ai` 서비스 계정) 방식도 사용 가능 (Bearer 토큰 자동 갱신).

### VERTEX_AI_FALLBACK 맵 (`account-pool.ts`)

```typescript
const VERTEX_AI_FALLBACK = {
  'gemini-3-pro-preview':     'gemini-2.5-pro',
  'gemini-3-flash-preview':   'gemini-2.5-flash',  // 404 on aiplatform.googleapis.com
  'gemini-3.0-flash-preview': 'gemini-2.5-flash',
};
```

---

## 분석 프롬프트 구조

### systemInstruction (`ANALYSIS_SYSTEM_INSTRUCTION`)

역할 설정 + Anti-Hallucination 경고:

```
[Analysis Order]
Step 1. 악기 인식 먼저
Step 2. BPM 측정 (Double-time 오류 주의: 아르페지오 ≠ BPM)
Step 3. 에너지 레벨 (피아노 솔로 최대 6)
Step 4. 구조·코드 분석

[Anti-Hallucination 경고]
- 프롬프트 수치 예시를 복사하지 마라
- 존재하지 않는 악기·래핑·노이즈를 만들어내지 마라
```

**핵심 교훈**: 프롬프트에 구체적 수치(160BPM, 75BPM 등)를 예시로 넣으면 few-shot 오염 발생.  
AI Studio 비교 테스트로 확인 → 수치 예시 전부 제거 후 해결.

### 분석 출력 구조 (`mediaAnalysisSchema`)

```
1. 기본 메타데이터: key, tempo_bpm, time_signature, energy_level(1~10)
2. 시간대별 구조: song_sections[] (name, start/end_time, bars, energy, characteristics)
3. 리듬 밀도: notes_per_bar_avg, syllables_per_bar_min/max, lyric_density_recommendation
4. 화성·감정선: chord_progression, chord_character, emotional_change
5. 멜로디 프로파일: vocal_range_expected, accent_position, vocal_recommendation
6. 가사 구조 가이드: lyric_structure_guide[] (섹션별 1:1 매핑, lyric_note에 "/" 호흡 표기 포함)
```

#### lyric_structure_guide 예시 출력

```
[Verse 1] 에너지 3/10
  syllables: 6~8 — 80BPM 4분음표 기반 여백 필요
  style: 독백/배경설명
  note: 창가에 / 비친 / 너의 / 뒷모습 / 보며
```

---

## 가사 생성 프롬프트 구조 (`prompt-builder.ts`)

분석 결과를 3개 축으로 조립:

```
## 레퍼런스 트랙 분석
### 1. BPM + 리듬 → 가사 음절 결정
  템포: 80.7 BPM | 박자: 4/4
  권장 음절/마디: 5~10 — 범위 초과 시 여백 붕괴

### 2. 코드 진행 → 가사 감정선
  조성: C Major
  버스 코드: Fmaj7 → G7 → Em7 → Am7
  분위기: reflective, melancholic

### 3. 시간별 구간 → 가사 형식(Form)
  [Verse 1] 0:13 ~ 0:39 (10bars)
    화성: sparse piano, low tension
    음절: 6~8
    스타일: 독백/배경설명
    지침: 창가에 / 비친 / 너의 / 뒷모습 / 보며
  ...
```

---

## 테스트 결과

### hero_1.mp3 (피아노 발라드)

```
BPM: 80.7 | C Major | 에너지 3/10
악기: Acoustic Piano
코드: Fmaj7 → G7 → Em7 → Am7 (Royal Road)
감정: 차분한 성찰 → 잔잔한 우수
```

### lp_ref.mp3 (래그 어게인스트 더 머신 스타일 록)

```
BPM: 161.5 | E Minor | 에너지 9/10
악기: Distorted Guitar, Bass, Drums, Male Vocals
섹션: 12개 (1:1 guide 매핑)
```

---

## 가사 생성 파이프라인 흐름

```
POST /api/music-gen/sessions/:id/upload
  → analyzeMediaFromUrl() → Gemini multimodal → mediaAnalysis JSON 저장

POST /api/music-gen/generate
  → generateContent(channel, emotionInput, mediaAnalysis)
  → buildSystemPrompt(channel)
  → buildUserPrompt(emotionInput, mediaAnalysis)  ← 3축 구조로 주입
  → Gemini → { title_en, title_jp, lyrics, suno_style_prompt, narrative }
```

### 생성 모델 설정 (`generator.ts`)

```typescript
PROFILES.creative_lyrics: { temperature: 1.0, topP: 0.95 }
```

---

## 채널 설정 (Lucid White 기준)

```
channel_id: 9
channel_name: Lucid White
lyric_format: jp_tagged  (Suno 섹션 태그 + 일본어 가사)
```

---

## 주요 결정사항 및 교훈

1. **responseSchema 제거**: Gemini의 responseSchema가 코드 보이싱을 단순화시킴 (Fmaj7 → F로 축약). free-form JSON + 프롬프트 지시로 대체.

2. **vertex-ai-apikey 정상 동작 확인**: 초기 SDK v1.50.0에서 에러가 있었으나 현재는 `vertexai:true + apiKey` 조합 정상 동작. `gemini-api` 또는 `vertex-ai-apikey` 모두 사용 가능.

3. **Few-shot 오염**: 프롬프트 내 구체적 수치 예시(BPM, 장르)가 hallucination 유발. 전부 추상적 placeholder로 교체.

4. **Anti-Hallucination 3단계**: 악기 먼저 인식 → Double-time 오류 경고 → 존재하지 않는 데이터 생성 금지.

5. **lyric_structure_guide 1:1 매핑**: "EXACTLY same number as song_sections" 명시로 섹션 누락 방지.
