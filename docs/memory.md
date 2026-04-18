# Project Memory
Updated: 2026-04-18 12:00

## Architecture
- 글로벌 오디오: AudioPlayerProvider(Context) + subscribe 패턴 (currentTime 제외로 리렌더 방지)
- PlayBar: StudioHeader 내부 컴팩트 인라인 (PC 상단, 모바일 하단은 미적용 — 헤더 내부로 통합)
- 브릿지: document play 캡처로 미전환 audio 자동 가로채기 (data-global-player/data-no-bridge 제외)
- Suno API: /api/generate/v2-web/ 엔드포인트, control_sliders(audio_weight/style_weight/weirdness_constraint)
- vocal_gender: m/f 지정 시 스타일 태그에서 성별 보컬 키워드 자동 제거 (draft_song.py)

## Patterns
- 날짜 포맷: toLocaleDateString('ko-KR') 사용 금지 → `${y}.${m+1}.${d}` 직접 포맷
- 카운트 기준: workspace_tracks 대신 draft_songs(done) JOIN midi_draft_rows 사용
- 제목 반복 방지: 기존 제목 50개에서 단어 빈도 추출 → top-15만 프롬프트에 전달 (~160토큰)
- suno-upload 후 moveClipsToWorkspace 호출 필수 (suno_project_id 있을 때)

## Stack
- Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, SQLite(better-sqlite3), Python daemon, Suno API, Gemini API, R2

## Sessions
- main: 2026-04-18 — 글로벌 오디오 플레이어 + 버그 수정 일괄
