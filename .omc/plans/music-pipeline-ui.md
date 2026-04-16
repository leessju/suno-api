# Music Production Pipeline UI Redesign

**Date:** 2026-04-16
**Status:** DRAFT (pending user confirmation)
**Complexity:** HIGH
**Estimated scope:** ~15 files (6 new pages, 5 new components, 2 DB migrations, 2 API routes)

---

## RALPLAN-DR Analysis

### Principles (5)

1. **Pipeline-First Navigation** -- 관리자가 "지금 어디까지 진행됐는가"를 1초 안에 파악 가능해야 한다
2. **Single-Workspace Focus** -- 한 워크스페이스의 모든 파이프라인 단계를 한 곳에서 제어한다 (화면 이동 최소화)
3. **Batch-Friendly** -- 곡 목록 일괄 선택, 일괄 순서 지정, 일괄 이미지 배정이 기본이다
4. **Progressive Disclosure** -- 완료되지 않은 단계는 disabled/collapsed로 보여주고, 현재 단계를 강조한다
5. **Non-Destructive** -- 되돌리기 가능한 액션(순서 변경, 이미지 교체)과 확인이 필요한 액션(업로드, 머지)을 구분한다

### Decision Drivers (Top 3)

| # | Driver | Weight |
|---|--------|--------|
| 1 | 관리 효율성 -- 2~10명의 관리자가 최소 클릭으로 10단계 파이프라인을 제어 | 최우선 |
| 2 | 진행 상태 가시성 -- 현재 워크스페이스가 전체 10단계 중 어디인지 즉시 인지 | 높음 |
| 3 | 점진적 구현 가능성 -- 현재 코드(better-sqlite3 + Next.js 14 SSR/CSR 혼합)와 호환, P2~P3 점진 추가 가능 | 높음 |

### Viable Options

#### Option A: Single-Page Pipeline (Stepper + Tabbed Panels)

워크스페이스 상세 페이지(`/workspaces/[id]`)를 10-step stepper로 구성. 각 단계가 탭/패널로 전환. 한 화면에서 모든 작업.

| Pros | Cons |
|------|------|
| 화면 전환 없음 -- 관리자 효율 최대 | 한 페이지 코드 복잡도 높음 (컴포넌트 분리 필수) |
| 진행 상태 항상 상단에 노출 | 초기 로드 시 데이터 많을 수 있음 (lazy load 필요) |
| 워크스페이스 = 파이프라인 1:1 매핑 직관적 | 모바일 대응이 어려울 수 있음 (관리 도구이므로 수용 가능) |

#### Option B: Multi-Page Pipeline (Step별 독립 페이지)

`/workspaces/[id]/step/1-input`, `/workspaces/[id]/step/2-music-list` 등 각 단계를 별도 URL로 분리.

| Pros | Cons |
|------|------|
| 코드 분리 명확 -- 각 step이 독립 page.tsx | 단계 간 이동 시 화면 전환 + 네트워크 요청 |
| URL 공유로 특정 단계 직접 접근 가능 | stepper 상태를 매 페이지에서 fetch 필요 |
| Next.js SSR 자연스러운 활용 | 관리자가 단계별로 왔다 갔다 하면 비효율 |

### 권장 방향: Option A (Single-Page Stepper)

**이유:** 2~10명 관리자가 사용하는 내부 도구이므로, 화면 전환 최소화가 관리 효율에 결정적. 코드 복잡도는 컴포넌트 분리로 해결 가능. URL 직접 접근은 query parameter(`?step=3`)로 보완.

---

## Current State Analysis (문제점)

### 현재 화면 구조

| 페이지 | 현재 상태 | 문제 |
|--------|-----------|------|
| `/` (대시보드) | 통계 3개 + 최근 워크스페이스 | 파이프라인 진행 상태 없음 |
| `/workspaces/new` | 채널선택 + 소스입력 + 생성 | 기능적이나 파이프라인 진입점 불명확 |
| `/workspaces/[id]` | **"파이프라인 구현 진행 중 (P2에서 완성)"** | 사실상 빈 페이지 |
| `/workspaces/[id]/variants` | Gemini variants 선택 | 다크모드 하드코딩(`bg-gray-900`), stepper 없음 |
| `/queue` | Job 목록 | 워크스페이스와 연결 불명확 |
| `/tracks` | 트랙 ID 나열 | 곡 제목/가사/스타일 없음, 오디오 미리듣기 없음 |
| `/assets` | R2 파일 + MIDI | 워크스페이스와 연결 없음 |
| `/approvals/[id]` | 결재 보드 | 독립 동작, 파이프라인 흐름 밖 |

### 핵심 문제

1. **`/workspaces/[id]` 페이지가 빈 상태** -- 파이프라인의 핵심 화면이 미구현
2. **10단계 워크플로우에 대한 화면 설계가 전혀 없음** -- 이미지 연결, 영상 렌더링, 머지, 업로드, 쇼츠 페이지 부재
3. **stepper/progress 표시 없음** -- 관리자가 "이 워크스페이스가 어디까지 진행됐는지" 알 수 없음
4. **variants 페이지 테마 불일치** -- `bg-gray-900` 하드코딩 vs 다른 페이지는 dark: 접두사 사용
5. **SideNav에 "채널" 메뉴 없음** -- 채널 관리 진입점이 대시보드에서만 가능

---

## Work Objectives

### 목표 화면 구조 (총 3개 주요 화면 + 기존 화면 개선)

```
/ (대시보드)                    -- 기존 개선: 파이프라인 상태 요약 추가
/workspaces/new                -- 기존 유지 (약간 개선)
/workspaces/[id]               -- **핵심 신규: 10-Step Pipeline Stepper**
/channels                      -- 신규: 채널 목록
/channels/[id]                 -- 기존 개선
/settings                      -- 기존 유지
```

---

## Guardrails

### Must Have
- 워크스페이스 상세 페이지에서 10단계 파이프라인 전체를 제어 가능
- 각 단계의 완료/진행중/대기 상태 시각화 (stepper)
- 이미지-노래 연결 UX (drag-and-drop 또는 클릭 배정)
- 머지 순서 지정 UX (drag-and-drop reorder)
- 쇼츠 설명/댓글 편집 UI

### Must NOT Have
- 외부 UI 라이브러리 추가 (shadcn/ui 언급되었으나 실제 미설치 -- Tailwind only 유지)
- DB 스키마 대규모 변경 (기존 테이블 호환 유지, 컬럼 추가만)
- SSR-only 강제 (현재 혼합 패턴 유지, 파이프라인 페이지는 client component)

---

## Task Flow (6 Steps)

### Step 1: DB Schema Extension + Pipeline State API

**목표:** 워크스페이스에 파이프라인 단계 상태를 저장하고 조회하는 기반 구축

**작업 내용:**
- `workspaces` 테이블에 `pipeline_step` (TEXT, default 'input') 컬럼 추가
- `workspace_images` 테이블 신규 생성 (track_id, image_r2_key, image_url, order)
- `workspace_renders` 테이블 신규 생성 (track_id, video_r2_key, status, type='full'|'shorts')
- `workspace_merge_order` 테이블 신규 생성 (workspace_id, track_id, position)
- `workspace_youtube_uploads` 테이블 신규 생성 (workspace_id, type='full'|'shorts', youtube_video_id, status, description, pinned_comment)
- API: `GET /api/music-gen/workspaces/[id]/pipeline` -- 전체 파이프라인 상태 반환
- API: `PUT /api/music-gen/workspaces/[id]/pipeline` -- 단계 전환

**Acceptance Criteria:**
- [ ] `pipeline_step` 컬럼이 기존 워크스페이스에 default 'input'으로 추가됨
- [ ] pipeline API가 각 단계별 완료 조건(트랙 수, 이미지 연결 수 등)을 계산해 반환
- [ ] 새 테이블들이 migration 파일로 추가되고 기존 DB와 호환

### Step 2: Pipeline Stepper Component + Workspace Detail Redesign

**목표:** `/workspaces/[id]` 페이지를 10-step stepper 기반으로 완전 재구성

**작업 내용:**
- `PipelineStepper` 컴포넌트: 수평 step indicator (10단계)
  - 각 step: 아이콘 + 라벨 + 상태 (completed/active/pending)
  - 클릭으로 해당 단계 패널 전환
  - 현재 단계 하이라이트 + 완료 단계 체크마크
- `WorkspaceDetail` 페이지 리라이트:
  - 상단: 워크스페이스 이름 + 채널 + stepper
  - 중앙: 활성 단계 패널 (조건부 렌더링)
  - 하단: 단계별 액션 버튼 ("다음 단계로", "이전 단계로")

**10단계 정의:**

| Step | Key | Label | Panel Component |
|------|-----|-------|-----------------|
| 1 | channel | 채널 선택 | (생성 시 결정, 읽기전용 표시) |
| 2 | workspace | 워크스페이스 | (생성 시 결정, 읽기전용 표시) |
| 3 | input | MIDI/MP3 입력 | `StepInput` |
| 4 | music-list | 음악 리스트 | `StepMusicList` |
| 5 | image | 이미지 연결 | `StepImageAssign` |
| 6 | render | 영상 렌더링 | `StepRender` |
| 7 | merge | 최종 머지 | `StepMerge` |
| 8 | upload | YouTube 업로드 | `StepUpload` |
| 9 | shorts | 쇼츠 제작 | `StepShorts` |
| 10 | shorts-upload | 쇼츠 업로드 | `StepShortsUpload` |

**Acceptance Criteria:**
- [ ] stepper가 10단계를 시각적으로 표시하고, 현재 단계가 하이라이트됨
- [ ] 각 단계 클릭 시 해당 패널로 전환됨
- [ ] 완료된 단계는 체크마크 + 요약 정보 표시
- [ ] URL query parameter `?step=N`으로 직접 접근 가능

### Step 3: Core Pipeline Panels (Steps 3-4)

**목표:** MIDI/MP3 입력 + 음악 리스트 편집 패널 구현

**StepInput (Step 3):**
- YouTube URL 입력 또는 MP3 파일 업로드
- MIDI 추출 Job 트리거 + 진행 상태 표시
- 추출 완료 시 MIDI 정보(BPM, key) 표시

**StepMusicList (Step 4):**
- 생성된 곡 목록 (variants에서 가져옴)
- 각 곡: 제목(JP/EN), 가사, 스타일 프롬프트 인라인 편집
- 곡별 오디오 미리듣기 플레이어
- 곡 선택/해제 체크박스 (이후 단계에 포함할 곡 결정)
- "Gemini로 재생성" 버튼

**Acceptance Criteria:**
- [ ] MIDI 추출 Job이 enqueue되고 SSE/polling으로 완료 확인 가능
- [ ] 곡 목록에서 제목/가사/스타일을 인라인 편집하고 저장 가능
- [ ] 체크된 곡만 다음 단계로 전달됨

### Step 4: Image Assignment + Render Panel (Steps 5-6)

**목표:** 이미지 연결 UX + 영상 렌더링 패널 구현

**StepImageAssign (Step 5):**
- 좌측: 선택된 곡 목록 (세로 스크롤)
- 우측: 이미지 라이브러리 (R2에서 로드) + 업로드 영역
- 연결 방식: 곡 카드 클릭 -> 우측에서 이미지 클릭 (또는 드래그)
- 각 곡 카드에 연결된 이미지 썸네일 표시
- 이미지 미연결 곡은 경고 표시

**StepRender (Step 6):**
- 렌더링 대상 곡 목록 (이미지 연결 완료된 곡만)
- "전체 렌더링 시작" 버튼 -> Job 일괄 enqueue
- 각 곡별 렌더링 상태 (pending/rendering/done/failed)
- 완료된 영상 미리보기 링크

**Acceptance Criteria:**
- [ ] 모든 선택된 곡에 이미지가 연결되어야 다음 단계 진행 가능
- [ ] 이미지 연결이 클릭 2회 이내로 완료됨 (곡 선택 + 이미지 선택)
- [ ] 렌더링 Job 상태가 실시간으로 표시됨

### Step 5: Merge + YouTube Upload Panels (Steps 7-8)

**목표:** 머지 순서 지정 + YouTube 업로드 패널 구현

**StepMerge (Step 7):**
- 렌더링 완료된 영상 목록
- **Drag-and-drop 순서 지정** (HTML5 drag API, 라이브러리 없이)
  - 각 카드: 순서 번호 + 곡 제목 + 썸네일 + 드래그 핸들
  - 번호 직접 입력도 가능 (fallback)
- 선택/해제 체크박스 (머지에서 제외할 곡)
- "머지 시작" 버튼 -> Job enqueue
- 머지 진행 상태 표시

**StepUpload (Step 8):**
- 머지된 영상 미리보기
- YouTube 메타데이터 편집:
  - 제목, 설명, 태그, 카테고리, 공개 상태
- "YouTube 업로드" 버튼 -> 현재 채널에 업로드
- 업로드 완료 시 YouTube 링크 표시

**Acceptance Criteria:**
- [ ] Drag-and-drop으로 곡 순서 변경이 가능하고, 순서가 DB에 저장됨
- [ ] 번호 직접 입력으로도 순서 변경 가능 (접근성)
- [ ] YouTube 업로드 전 메타데이터 확인/편집 가능

### Step 6: Shorts Pipeline + Dashboard Enhancement (Steps 9-10 + Dashboard)

**목표:** 쇼츠 제작/업로드 패널 + 대시보드 파이프라인 요약

**StepShorts (Step 9):**
- 곡별 쇼츠 영상 생성 트리거
- 생성 상태 표시 (full과 동일 패턴)

**StepShortsUpload (Step 10):**
- 각 쇼츠별:
  - 영상 미리보기
  - **설명(description) 편집** textarea
  - **하단 고정 댓글(pinned comment) 편집** textarea
  - 업로드 버튼 (개별 또는 일괄)
- 업로드 완료 시 YouTube Shorts 링크 표시

**Dashboard 개선:**
- 최근 워크스페이스에 `pipeline_step` 뱃지 추가 (현재 단계 표시)
- 파이프라인 진행률 프로그레스바 (n/10 단계)

**SideNav 개선:**
- "채널" 메뉴 항목 추가
- 워크스페이스 하위에 최근 3개 워크스페이스 quick-link

**Acceptance Criteria:**
- [ ] 쇼츠별 설명과 하단 댓글을 개별 편집하고 저장 가능
- [ ] 대시보드에서 각 워크스페이스의 파이프라인 진행 단계를 즉시 확인 가능
- [ ] SideNav에서 채널 목록 페이지 접근 가능

---

## Success Criteria (Overall)

1. 관리자가 새 워크스페이스 생성부터 쇼츠 업로드까지 **한 화면(`/workspaces/[id]`)에서 완료** 가능
2. 각 단계의 상태가 stepper로 **1초 내 파악** 가능
3. 대시보드에서 모든 워크스페이스의 **파이프라인 진행률 한눈에 확인** 가능
4. 이미지 연결이 **곡당 클릭 2회 이내**로 완료
5. 머지 순서 지정이 **drag-and-drop 또는 번호 입력**으로 가능
6. 기존 DB 스키마 **하위 호환 유지** (새 테이블/컬럼 추가만)

---

## ADR (Architectural Decision Record)

**Decision:** Option A -- Single-Page Pipeline (Stepper + Tabbed Panels)

**Drivers:**
1. 관리 효율성 (화면 전환 최소화)
2. 진행 상태 상시 가시성
3. 현재 코드베이스 호환성

**Alternatives Considered:**
- Option B (Multi-Page Pipeline): URL 분리로 코드는 깔끔하지만, 관리자 워크플로우에서 단계 간 빈번한 이동이 비효율적

**Why Chosen:**
- 2~10명 관리자가 사용하는 내부 도구에서 화면 전환 0회는 결정적 이점
- 컴포넌트 분리(`StepInput`, `StepMusicList` 등)로 코드 복잡도 관리 가능
- `?step=N` query parameter로 URL 직접 접근도 보완

**Consequences:**
- `/workspaces/[id]/page.tsx`가 orchestrator 역할로 비교적 큰 파일이 됨 (but 각 step은 독립 컴포넌트)
- 초기 로드 시 모든 step 컴포넌트가 번들에 포함 (dynamic import로 완화 가능)
- variants 페이지(`/workspaces/[id]/variants`)는 Step 4 패널로 흡수하여 제거

**Follow-ups:**
- P3에서 auto 모드(원클릭) 파이프라인 자동 진행 로직 구현
- 텔레그램 알림 연동 (단계 완료 시 자동 알림)
- 다중 워크스페이스 동시 관리 대시보드 (칸반 뷰)
