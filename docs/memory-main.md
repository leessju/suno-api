# Session: main
Updated: 2026-04-18 12:00

## Now
- 목표: 글로벌 오디오 플레이어 구현 + 버그 수정 (vocal_gender, upload workspace, 날짜 포맷)
- 진행:
  - suno-upload: moveClipsToWorkspace 추가 (원곡 올바른 workspace로 이동)
  - vocal_gender: m/f 지정 시 스타일 태그에서 성별 보컬 키워드 제거
  - cover_count: workspace_tracks → draft_songs(done) 기준 카운트, "Cover N곡" 레이블
  - 날짜 포맷: toLocaleDateString 제거 → 2026.4.18 형식 (7개 파일)
  - 제목 반복 방지: Gemini 프롬프트에 기존 제목 단어 빈도 top-15 전달
  - 글로벌 오디오 플레이어: AudioPlayerProvider + GlobalPlayBar(헤더 내 컴팩트) + 3페이지 연결
- 파일: AudioPlayerProvider.tsx, GlobalPlayBar.tsx, layout.tsx, StudioHeader.tsx, tracks/page.tsx, midis/[midiId]/page.tsx, generate/page.tsx, suno-upload/route.ts, draft_song.py, prompt-builder.ts, generator.ts, contents.ts, workspaces/[id]/route.ts, queue/page.tsx, midis/page.tsx, workspaces/page.tsx, channels/[id]/page.tsx, openclaw/page.tsx, upload/page.tsx
- 에러: 없음 (기존 tracks/route.ts 타입 에러만 잔존)
- 다음: 브라우저 테스트 — 글로벌 플레이어 동작 확인

## Past
(첫 세션)
