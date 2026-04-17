# SyncLens Pipeline 자동화 시스템 — 구현 완료 보고서

**작업일**: 2026-04-17  
**브랜치**: main (worktree: site)  
**검증**: TypeScript tsc ✅ | ESLint ✅ | Python import ✅

---

## 개요

영상 제작 자동화 파이프라인(SyncLens) Phase 1 기반 구현 완료.  
MP3 파일 스캔 → Song 단계(S1~S5) × 곡수 + Vol 단계(V1~V8) 순차 실행 → Telegram 완료 알림까지의 전체 흐름을 구축했습니다.

---

## 구현 스토리 (8개 전부 완료)

### US-001: DB 마이그레이션 016
**파일**: `src/lib/music-gen/migrations/016_synclens_pipeline.sql`  
**내용**:

- `pipeline_runs` — 실행 단위 (workspace_id, channel_id, vol_name, status, total_songs 등)
- `pipeline_steps` — 개별 단계 (step_code S1~S5/V1~V8, phase, song_index, status, error)
- `pipeline_events` — 이벤트 로그 (event_type, message, metadata_json)
- 6개 인덱스 모두 `IF NOT EXISTS` (멱등 보장)
- `src/lib/music-gen/db.ts` `runMigrations()`에 016 등록

### US-002: channels 테이블 컬럼 추가
**파일**: `src/lib/music-gen/db.ts`  
**추가 컬럼**:

- `sync_lens_folder TEXT` — 채널 폴더명
- `youtube_token_path TEXT` — YouTube OAuth 토큰 경로
- `pragma table_info` 체크로 멱등 실행 보장

### US-003: Python SyncLens 오케스트레이터
**파일**: `workers/python/stages/synclens/__init__.py`, `workers/python/stages/synclens/orchestrate.py`  
**주요 기능**:

- `handle_synclens_orchestrate(payload, db_path)` — DAG 기반 다음 step 결정 및 enqueue
- **Song Phase DAG**: S1 → S2 → S3 → S4 → S5 (곡별 순차) → 전곡 완료 시 V1 전환
- **Vol Phase DAG**: V1 → V2 → ... → V8 → `pipeline_runs.status='completed'`
- 실패 시 `pipeline_events`에 `failed` 이벤트 INSERT + `telegram.send` job enqueue
- run status가 completed/cancelled/failed이면 early return (재진입 방지)

### US-004: dispatcher.py 업데이트
**파일**: `workers/python/dispatcher.py`  
**변경 사항**:

- `JOB_HANDLERS`에 `'synclens.orchestrate'` 등록
- `HEAVY_JOB_TYPES`에 `'synclens.extract_lyrics'`, `'synclens.render_song'` 추가 (동시 1개 제한)
- `_execute_job`: `_ack_job` 성공 후 `synclens.*` job이면 orchestrate job 자동 enqueue
- `_enqueue_orchestrate(run_id, completed_step_id)` 메서드 추가
- **무한루프 방지**: `job_type != 'synclens.orchestrate'` 조건으로 자기 재enqueue 차단

### US-005: Pipeline API Routes
**파일**: `src/app/api/music-gen/pipeline/route.ts`, `src/app/api/music-gen/pipeline/[runId]/route.ts`

**POST /api/music-gen/pipeline**

1. `SYNC_LENS_ROOT` 환경변수 확인 (미설정 시 500)
2. `{sync_lens_root}/{channel_folder}/{vol_name}/01_songs/` 스캔 → mp3 파일 목록
3. `pipeline_runs` INSERT + Song steps (S1~S5 × 곡수) + Vol steps (V1~V8) 일괄 INSERT
4. 첫 번째 곡의 S1에 `synclens.extract_lyrics` job enqueue → 파이프라인 시작

**GET /api/music-gen/pipeline** — 목록 + 상태별 카운트  
**GET /api/music-gen/pipeline/[runId]** — run + steps + events(최신 50개)  
**PATCH /api/music-gen/pipeline/[runId]** — pause / resume / cancel 상태 전환

### US-006: 파이프라인 대시보드 UI
**파일**: `src/app/(studio)/pipeline/page.tsx`  
**구성**:
- 상태 카운트 카드 4개 (실행중/대기/완료/실패)
- 실행 목록: vol_name, 채널명, status badge, 진행바, 단계 카운트, 경과시간
- 빈 상태 dashed border 안내
- `<AutoRefresh />` 컴포넌트로 10초마다 자동 새로고침

### US-007: 파이프라인 상세 페이지
**파일**: `src/app/(studio)/pipeline/[runId]/page.tsx`  
**구성**:

- **Song Phase 매트릭스**: 곡명(행) × S1~S5(열), status 아이콘 (✅🔄⏸❌🔁⏭)
- **Vol Phase 타임라인**: V1~V8 카드 그리드, status별 색상 배지
- **이벤트 로그**: 시간순 최신 50개
- 실패 step/card에 `title` 속성으로 에러 내용 툴팁 표시
- `<AutoRefresh />` 10초 자동 새로고침
- pause / resume / cancel 액션 버튼

### US-008: SideNav 파이프라인 메뉴
**파일**: `src/components/SideNav.tsx`  
**변경 사항**:
- `PipelineIcon` SVG 추가 (Bars3 계열 아이콘)
- `sections` 배열에 `{ id: 'pipeline', label: '파이프라인', icon: <PipelineIcon />, items: [{ href: '/pipeline', label: '파이프라인' }] }` 추가
- `openSections` 초기값에 `pipeline: false` 추가
- `sectionHref`에 `pipeline: '/pipeline'` 추가
- 접힘 모드에서도 아이콘으로 표시

---

## AutoRefresh 컴포넌트

**파일**: `src/app/(studio)/pipeline/_components/AutoRefresh.tsx`

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(timer)
  }, [router, intervalMs])
  return null
}
```

Server Component에 Client Component를 삽입하는 패턴으로 구현.  
`router.refresh()`로 서버 데이터를 재fetch하며 전체 페이지 reload 없이 갱신.

---

## 파이프라인 실행 흐름

```
POST /api/music-gen/pipeline
  ↓ 01_songs/*.mp3 스캔
  ↓ pipeline_runs INSERT (status=running)
  ↓ pipeline_steps INSERT (Song S1~S5 × N곡 + Vol V1~V8)
  ↓ job_queue INSERT (synclens.extract_lyrics, song_index=1)
  
dispatcher.py 폴링
  ↓ synclens.extract_lyrics job 실행
  ↓ _ack_job → _enqueue_orchestrate(run_id, step_id)
  
synclens.orchestrate
  ↓ completed_step.status = 'completed'
  ↓ 같은 곡 다음 step 있으면 → 해당 job enqueue
  ↓ S5 완료 → 다음 곡 S1 enqueue (OR 전곡 완료 → V1 enqueue)
  ↓ V8 완료 → pipeline_runs.status = 'completed' + telegram.send
```

---

## Deslop 패스 결과

| 항목 | 결과 |
|------|------|
| `ShieldCheckIcon` (SideNav.tsx) | 미사용 dead code → 삭제 |
| `generateId()` 헬퍼 | 4곳 재사용, 유효 → 유지 |
| STATUS_BADGE/STATUS_LABEL 중복 | 별도 route 파일 구조상 허용 → 유지 |

---

## 아키텍트 검토 결과

**판정**: APPROVE (조건부)

| 항목 | 판정 |
|------|------|
| 무한루프 방지 로직 | ✅ `job_type != 'synclens.orchestrate'` 조건 올바름 |
| SQLite 멱등성 | ✅ `IF NOT EXISTS` + pragma 체크 모두 적용 |
| job_queue FK 참조 | ✅ `job_queue.id` 정확히 참조 |
| Next.js 15 async params | ✅ 두 route 파일 모두 적용 |

**발견된 결함 (Phase 2 개선 권장)**:

- `resume` 액션 시 진행 중이던 step 재enqueue 미구현 (기능상 재개 불완전)
- POST route와 `_start_first_step`이 이중 진입점 구조 (논리적 중복)

---

## 검증 결과

| 검증 항목 | 결과 |
|-----------|------|
| `pnpm tsc --noEmit` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 |
| Python import (orchestrate.py) | ✅ |
| Python import (dispatcher.py) | ✅ |

---

## 환경변수 필수 설정

```env
SYNC_LENS_ROOT=/path/to/synclens/root  # POST /pipeline 필수
```

---

## 다음 단계 (Phase 2)

1. **S1~S5, V1~V8 실제 핸들러 구현** — `workers/python/stages/synclens/` 하위에 각 step 파일 추가, `JOB_HANDLERS` 등록
2. **resume 로직 보완** — PATCH resume 시 현재 running step 재enqueue
3. **파이프라인 생성 UI** — `/pipeline` 페이지에 "새 파이프라인" 폼 추가
4. **실패 재시도 UI** — 실패 step 클릭 → 재시도 버튼
