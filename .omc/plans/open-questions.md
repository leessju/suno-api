# Open Questions

## music-pipeline-ui - 2026-04-16

- [ ] YouTube Upload API 연동 방식 -- Google OAuth가 이미 설정되어 있는지, 아니면 새로 구현해야 하는지 확인 필요. `google-auth-library` 패키지가 설치되어 있으나 실제 YouTube Data API v3 업로드 구현 여부 미확인.
- [ ] 영상 렌더링 엔진 -- 영상 렌더링(이미지+오디오 합성)을 서버에서 FFmpeg로 처리하는지, 외부 서비스를 사용하는지 결정 필요. 현재 코드에 렌더링 로직 미발견.
- [ ] 쇼츠 영상 생성 방식 -- 풀 영상에서 자동 잘라내기인지, 별도 세로형 영상을 새로 렌더링하는지 결정 필요.
- [ ] 이미지 소스 -- 배경 이미지를 관리자가 직접 업로드만 하는지, AI 생성(Gemini 등)도 지원하는지 범위 결정 필요.
- [ ] R2 vs 로컬 저장소 -- 렌더링된 영상 파일을 R2에 저장할지, 로컬 파일시스템에 저장할지. 현재 R2 연동(`src/lib/r2.ts`)이 있으나 대용량 비디오에 적합한지 확인 필요.
- [ ] drag-and-drop 라이브러리 -- HTML5 native drag API로 충분한지, `@dnd-kit/core` 같은 라이브러리가 필요한지. 관리자 수가 적으므로 native로 시작하는 것을 권장하나 사용자 확인 필요.

## sidebar-nav-redesign - 2026-04-16

- [ ] `workspace_renders` / `workspace_uploads` 테이블이 기존 파이프라인 코드(`/api/music-gen/workspaces/[id]/merge`, `/shorts`, `/upload`)와 필드 호환인지 확인 필요 — 호환되지 않으면 마이그레이션을 CREATE TABLE 대신 CREATE VIEW로 대체 결정 필요
- [ ] Job 큐(`/queue`) 및 OpenClaw(`/openclaw`)를 새 IA에 흡수할지, "기타" 섹션으로 보존할지 — 사용자 확인 필요
- [ ] 모바일 드로어 스와이프 제스처를 1차 범위에 포함할지 — 기본은 햄버거 버튼만 포함, 추후 확장 여부 확인
- [ ] musix-gen 로고 심볼 — 디자이너가 전용 심볼을 제공할지, SVG 인라인 초안(음표+웨이브폼)으로 출시할지 결정 필요
- [ ] `/settings/profile` 페이지 본체 — `header-profile-ui` 팀이 담당 중, 머지 순서·인터페이스 계약 확정 필요 (본 계획은 라우트·링크만 선반영)
- [ ] Suno 계정 드롭다운을 사이드바 하단 프로필 푸터로 완전 이전할지, `StudioHeader`에도 빠른 전환용으로 남길지 — 사용자 최종 확인 필요 (현재 계획: 사이드바 단일 배치)
- [ ] `WorkspaceTree` 내 MIDI 하위 트리와 `#미디파일` 전역 목록의 역할 중복 여부 — 보완 관계 유지로 설계했으나 사용자 피드백 필요
