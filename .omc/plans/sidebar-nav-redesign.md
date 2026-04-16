# 좌측 네비게이션 UX 재설계 계획 (musix-gen)

> **플랜 ID**: `sidebar-nav-redesign`
> **작성일**: 2026-04-16
> **참조 디자인**: Cloudflare Docs 사이드바 스타일
> **동시 진행 팀**: `header-profile-ui` (Suno 암호화, 프로필 이미지 R2, 텔레그램 DB화)

---

## 1. 컨텍스트 (Context)

현재 `SideNav`는 "대시보드 + WorkspaceTree + 하단 유틸(Job큐/에셋/트랙/OpenClaw/텔레그램/설정)" 구조로, 네비게이션 위계가 평평하고 기능 영역이 시각적으로 섞여 있습니다. `StudioHeader`는 [Suno 계정 드롭다운 | 채널 드롭다운 | 테마토글]을 담고 있지만, `header-profile-ui` 팀 작업으로 채널 드롭다운은 헤더 오른쪽으로 이동하고 프로필 버튼이 추가될 예정입니다.

사용자 요구는 Cloudflare Docs 풍의 **섹션형 사이드바**로 채널/워크스페이스/미디파일/노래리스트/렌더영상/업로드영상/에셋관리로 축을 재편하고, 프로필을 **사이드바 하단 고정**에 두는 것입니다. 기존 `WorkspaceTree`의 펼침·배지·lazy-load UX는 살리되, 여러 전역 리스트 화면(노래리스트, 렌더영상, 업로드영상)을 새로 만들어야 합니다.

---

## 2. 작업 목표 (Work Objectives)

1. Cloudflare Docs 스타일의 섹션형 `SideNav`를 만든다. (로고, 섹션 토글, 활성 하이라이트, 하단 프로필 고정)
2. 요구 메뉴 트리를 라우팅으로 구현한다. (채널/워크스페이스/미디파일/노래리스트/렌더영상/업로드영상/에셋관리/프로필)
3. `StudioHeader`와의 역할 분담을 확정한다. (사이드바=탐색, 헤더=컨텍스트 스위처+프로필)
4. 기존 `WorkspaceTree`를 새 `#워크스페이스` 섹션 안에 재배치한다.
5. 신규 페이지에 필요한 DB 스키마(예: `telegram_config`, `user_profile`)와 전역 목록 쿼리 뷰를 추가한다.
6. `header-profile-ui` 팀 변경과 충돌하지 않도록 인터페이스 경계를 정의한다.

---

## 3. 가드레일 (Guardrails)

### Must Have
- 기존 `/workspaces/[id]` 라우트 및 링크 호환성 유지
- `ChannelProvider` / `SunoAccountProvider` 컨텍스트 계속 사용 (localStorage 키 동일)
- 접근권한 체크 (`(studio)/layout.tsx`의 `auth.api.getSession`) 보존
- 다크/라이트 테마 동시 지원 (현재 클래스 패턴: `dark:bg-gray-900` 등)
- 사이드바 너비는 접힘/펼침 상태 모두에서 레이아웃 시프트 없음

### Must NOT Have
- `src/app/api/music-gen/**` 기존 API 스펙 파괴 변경 금지 (추가만 허용)
- `(studio)/workspaces/[id]/**` 하위 라우트 경로 변경 금지
- `StudioHeader`에 중복된 프로필 UI 추가 금지 (`header-profile-ui`와 충돌 방지)
- `header-profile-ui`가 담당하는 Suno 쿠키 암호화/프로필 이미지 R2 업로드 기능을 본 계획에서 구현 금지

---

## 4. 태스크 흐름 (Task Flow)

```
[T1 정보구조] → [T2 DB/API] → [T3 컴포넌트 뼈대]
                                    ↓
                   [T4 섹션별 신규 페이지] ← 병렬
                                    ↓
                          [T5 헤더 재배치·정합성]
                                    ↓
                          [T6 QA 및 마이그레이션 실행]
```

---

## 5. 상세 TODO

### T1. 정보 구조(IA) 확정 — 문서화
**파일**: `.omc/plans/sidebar-nav-redesign.md` (본 문서) 내부 섹션으로 확정

- 메뉴와 URL 매핑을 다음 표와 동일하게 고정
- 각 메뉴 항목의 데이터 소스/API/필터 파라미터 명시

**메뉴 ↔ 라우팅 매핑 표**

| 섹션 | 하위 항목 | URL | 데이터 소스 |
|------|-----------|------|-------------|
| # 채널 | 목록 | `/channels` (신규) | `GET /api/music-gen/channels` |
| | 시스템프롬프트 관리 | `/channels/[id]` (기존 `prompt` 탭) | `GET/PUT /api/music-gen/channels/[id]` |
| | 대화 기록 로그 | `/channels/[id]/logs` (신규) | `GET /api/music-gen/sessions?channel_id=` |
| # 워크스페이스 | 트리(기존) | `/workspaces` (신규 인덱스) + 하위 유지 | `WorkspaceTree` 재사용 |
| | 상세 | `/workspaces/[id]` (기존) | 유지 |
| # 미디파일 | 전체 목록 | `/midis` (신규) | `GET /api/music-gen/midis` (신규 집계 API) |
| | 워크스페이스별 | `/midis?workspace_id=` | 동일 API에 쿼리 필터 |
| | 타입별 (YouTube/MP3) | `/midis?source_type=youtube_video\|mp3_file` | 동일 |
| # 노래리스트 | 전체 트랙 | `/tracks` (기존, 개편) | `GET /api/music-gen/tracks` (신규 집계 API) |
| | 필터 | 쿼리 파라미터 `workspace_id`, `midi_id`, `sort=asc\|desc` | 동일 |
| # 렌더영상 | 개별곡 | `/renders/tracks` (신규) | `GET /api/music-gen/renders?type=track` |
| | 머지영상 | `/renders/merges` (신규) | `GET /api/music-gen/renders?type=merge` |
| # 업로드영상 | 풀영상 | `/uploads/full` (신규) | `GET /api/music-gen/uploads?type=full` |
| | 쇼츠 | `/uploads/shorts` (신규) | `GET /api/music-gen/uploads?type=short` |
| # 에셋관리 | 에셋 라이브러리 | `/assets` (기존) | 유지 |
| | 썸네일 관리 | `/assets/thumbnails` (신규) | `GET /api/music-gen/back-images` (필터 `is_cover`) |
| # 프로필 (하단) | 계정정보 | `/settings/profile` (신규, `header-profile-ui` 담당) | `better_auth.user` |
| | Suno 계정정보 | `/settings/suno-accounts` (기존) | `GET /api/music-gen/suno-accounts` |

**수용 기준**
- 위 표가 이 플랜 문서에 기록되어 있음
- `header-profile-ui` 담당 범위(`/settings/profile` 구현, `telegram` DB화)는 "외부 의존" 표시

---

### T2. DB/API 확장 (마이그레이션 + 신규 route)
**신규 파일**
- `src/lib/music-gen/migrations/009_nav_views.sql`
- `src/app/api/music-gen/midis/route.ts`
- `src/app/api/music-gen/tracks/route.ts`
- `src/app/api/music-gen/renders/route.ts`
- `src/app/api/music-gen/uploads/route.ts`

**마이그레이션 `009_nav_views.sql` 내용**

```sql
-- 1) 렌더영상 테이블 (개별 + 머지 통합)
CREATE TABLE IF NOT EXISTS workspace_renders (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  track_id         TEXT,                          -- NULL이면 merge
  render_type      TEXT NOT NULL CHECK(render_type IN ('track','merge','short')),
  r2_key           TEXT NOT NULL,
  duration_sec     INTEGER,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending','rendering','done','error')),
  error_message    TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_renders_ws    ON workspace_renders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_renders_type  ON workspace_renders(render_type);

-- 2) 업로드영상 테이블
CREATE TABLE IF NOT EXISTS workspace_uploads (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  render_id        TEXT REFERENCES workspace_renders(id) ON DELETE SET NULL,
  upload_type      TEXT NOT NULL CHECK(upload_type IN ('full','short')),
  youtube_video_id TEXT,
  youtube_url      TEXT,
  title            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending','uploading','done','error')),
  error_message    TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_ws     ON workspace_uploads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uploads_type   ON workspace_uploads(upload_type);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON workspace_uploads(status);
```

> 주의: 기존 파이프라인(`workspaces/[id]/merge`, `/shorts`, `/upload` API)은 이미 존재하지만, 전역 조회용 정규 테이블이 없다면 위 테이블을 기록 채널로 추가합니다. 기존 파이프라인이 이미 기록 중인 테이블이 있으면 마이그레이션은 뷰(`CREATE VIEW`) 방식으로 대체할 것.

**신규 API 스펙**
- `GET /api/music-gen/midis?workspace_id=&source_type=&channel_id=&suno_account_id=` → `workspace_midis` 전역 조회 (workspaces JOIN)
- `GET /api/music-gen/tracks?workspace_id=&midi_id=&sort=asc|desc&channel_id=` → `workspace_tracks` 전역 조회
- `GET /api/music-gen/renders?workspace_id=&type=track|merge|short&status=` → `workspace_renders`
- `GET /api/music-gen/uploads?workspace_id=&type=full|short&status=` → `workspace_uploads`

모든 라우트는 `ChannelProvider` / `SunoAccountProvider`의 필터와 일관되도록 `channel_id`, `suno_account_id` 쿼리 파라미터를 수용.

**수용 기준**
- 마이그레이션이 `better-sqlite3`에서 에러 없이 실행
- 네 개의 신규 API가 200 응답과 `{ data: [...] }` 포맷 반환
- 기존 `workspace_midis`, `workspace_tracks` 테이블을 변경하지 않음

---

### T3. 사이드바 컴포넌트 뼈대 재작성
**수정 파일**: `src/components/SideNav.tsx`
**신규 파일**
- `src/components/sidebar/NavSection.tsx` — 섹션 제목 + 확장/축소 버튼 + 자식 렌더
- `src/components/sidebar/NavItem.tsx` — 단일 Link 항목 (활성 하이라이트)
- `src/components/sidebar/SidebarFooter.tsx` — 프로필 영역 (하단 고정)
- `src/components/sidebar/MusixGenLogo.tsx` — SVG 로고
- `src/hooks/useSidebarSections.ts` — 섹션 열림/닫힘 상태(localStorage 지속)

**로고 디자인 방향** (`MusixGenLogo.tsx`)
- 형태: 음표(♪) + 웨이브폼(sine wave) 조합 / 정사각 24x24
- 색상 팔레트:
  - Primary: `#7C3AED` (violet-600) — 기존 `brand` 토큰과 호환
  - Secondary: `#EC4899` (pink-500) — 그라디언트 하이라이트
  - Dark 모드: `#A78BFA` (violet-400)
- 렌더: 인라인 SVG, `currentColor` 활용해 테마 전환 즉시 반응
- 텍스트 라벨: `musix-gen` (DM Sans 또는 기본 sans-serif, `font-semibold text-sm tracking-tight`)

**Side nav 루트 레이아웃 구조**

```
<aside className="w-64 ... flex flex-col">
  <Header>            // MusixGenLogo + "musix-gen"
  <Body scrollable>   // 섹션 리스트 (채널→워크스페이스→미디→트랙→렌더→업로드→에셋)
  <Footer sticky>     // SidebarFooter (프로필 + Suno 계정 요약)
</aside>
```

**NavSection 동작**
- 기본 펼침 상태: `(channel, workspace)` 펼침 / 나머지 접힘
- 토글 시 `useSidebarSections` 훅이 `localStorage.sidebarSections` 저장
- 활성 경로가 하위 항목이면 자동 펼침

**수용 기준**
- Cloudflare Docs 비교 스크린샷 기준, 섹션 타이포·들여쓰기·화살표 패턴 유사
- 레이아웃 시프트 없음 (전 섹션 접힘 상태에서도 너비 `w-64` 고정)
- localStorage 깨졌을 때도 런타임 크래시 없음 (try/catch)

---

### T4. 섹션별 신규 페이지 구현 (병렬)

**T4-a. `#채널`**
- **신규**: `src/app/(studio)/channels/page.tsx` — 채널 카드 그리드 (`channel_name`, `channel_handle`, 최근 업데이트)
- **신규**: `src/app/(studio)/channels/[id]/logs/page.tsx` — `sessions` + `messages` 조인하여 최신 20개 대화 로그 스트림 (가상 스크롤)
- 기존 `/channels/[id]/page.tsx`의 `prompt` 탭을 그대로 사용 (이미 시스템프롬프트 관리 UI 존재)

**T4-b. `#미디파일`**
- **신규**: `src/app/(studio)/midis/page.tsx`
  - 필터 바: [워크스페이스 select | 타입(YouTube/MP3) toggle | 상태 필터]
  - 테이블 컬럼: label, workspace, source_type 아이콘, status 배지, created_at
  - 행 클릭 → `/workspaces/[id]/midis/[midiId]`

**T4-c. `#노래리스트`**
- **개편**: `src/app/(studio)/tracks/page.tsx` → Client Component로 전환
  - 필터 바: [workspace_id | midi_id | sort(asc/desc)]
  - 컬럼: suno_track_id, workspace, channel, MIDI label, is_checked, checked_at
  - 행 클릭 → `/workspaces/[id]` 상세로 이동 (하이라이트 포함)

**T4-d. `#렌더영상`**
- **신규**: `src/app/(studio)/renders/tracks/page.tsx` (개별)
- **신규**: `src/app/(studio)/renders/merges/page.tsx` (머지)
- 카드 UI: 썸네일(첫 프레임) + 제목 + 길이 + 상태 배지 + 다운로드/재생 버튼

**T4-e. `#업로드영상`**
- **신규**: `src/app/(studio)/uploads/full/page.tsx`
- **신규**: `src/app/(studio)/uploads/shorts/page.tsx`
- 카드 UI: YouTube 임베드(있으면) + 상태 + 재업로드 버튼

**T4-f. `#에셋관리`**
- 기존 `/assets/page.tsx` 유지
- **신규**: `src/app/(studio)/assets/thumbnails/page.tsx` — `back_images` 중 `is_cover=1` 그룹핑 그리드

**수용 기준**
- 각 페이지가 최소 한 개의 실제 데이터 카드/행을 표시하거나 빈 상태 문구 표시
- URL 쿼리 파라미터로 필터 복원 가능 (`?workspace_id=`)
- 모든 신규 페이지가 `(studio)/layout.tsx` 스타일을 상속

---

### T5. 헤더·프로필 역할 분담 확정

**결정 사항 (ADR)**
- **채널 드롭다운**: `StudioHeader` 오른쪽에 유지 (`header-profile-ui` 팀이 이동 중). 사이드바의 `#채널` 섹션은 **탐색(시스템프롬프트 관리, 로그)** 목적이며, 현재 선택 채널 스위처가 아님. → 중복 없음.
- **Suno 계정 드롭다운**: `StudioHeader`에서 제거 후 **사이드바 하단 프로필 푸터의 서브 메뉴**로 이동. 이유: 사용자 요구 ("하단 프로필 > Suno 계정정보"). 현재 선택 계정은 프로필 푸터 라벨에 요약 표시.
- **프로필 버튼**: `header-profile-ui`가 헤더 오른쪽에 드롭다운을 추가하지만, 본 계획에서는 **사이드바 하단 `SidebarFooter`가 1차 진입점**. 헤더 버튼은 빠른 단축(로그아웃/테마) 용도로만 유지.
- **테마 토글**: `StudioHeader` 유지.

**수정 파일**
- `src/components/StudioHeader.tsx` — Suno 계정 드롭다운 제거, 채널 드롭다운은 우측 정렬 유지
- `src/components/sidebar/SidebarFooter.tsx` — 아바타 + 이름 + "Suno 계정 ⌄" 팝오버
- `src/app/(studio)/layout.tsx` — 변경 없음 (Provider 구조 유지)

**수용 기준**
- 페이지 상단에 Suno 계정·채널·프로필이 중복 표시되지 않음
- `SidebarFooter` 팝오버에서 Suno 계정 전환 시 `SunoAccountProvider.setSelectedAccount` 호출
- `header-profile-ui` PR과 병합 시 충돌은 `StudioHeader.tsx`와 `SidebarFooter.tsx` 두 파일에 국한

---

### T6. 정합성·마이그레이션·QA
- `src/lib/music-gen/db.ts`에서 `009_nav_views.sql` 자동 실행 로직 추가 확인
- 기존 하단 유틸 메뉴(Job큐, OpenClaw, 텔레그램, 설정) 처리:
  - Job큐(`/queue`) → 새 구조에서는 헤더 우측 "⚙️ 작업" 아이콘 또는 `#노래리스트` 페이지 내 서브 탭으로 흡수 고려 (1차는 사이드바 `기타` 접힘 섹션에 보존)
  - OpenClaw(`/openclaw`) → `기타` 섹션
  - 텔레그램 설정 → `#프로필 > 설정 링크`에 포함 (DB화는 `header-profile-ui` 담당)
  - 일반 설정(`/settings`) → `#프로필` 하단 링크

**QA 체크리스트**
- [ ] 라우트 전환 시 사이드바 섹션 확장 상태 유지
- [ ] 모바일(≤768px) 뷰에서 사이드바 접힘/햄버거 동작 (최소한 드로어 형태)
- [ ] `WorkspaceTree` 내 워크스페이스 선택 → 채널 필터와 정합
- [ ] 신규 4개 API가 빈 DB에서도 200 반환 (빈 배열)
- [ ] 다크모드에서 로고 SVG currentColor 적용 확인

---

## 6. 신규 페이지 및 마이그레이션 요약

### 신규 페이지 (11개)
1. `src/app/(studio)/channels/page.tsx`
2. `src/app/(studio)/channels/[id]/logs/page.tsx`
3. `src/app/(studio)/workspaces/page.tsx` (인덱스, 선택)
4. `src/app/(studio)/midis/page.tsx`
5. `src/app/(studio)/renders/tracks/page.tsx`
6. `src/app/(studio)/renders/merges/page.tsx`
7. `src/app/(studio)/uploads/full/page.tsx`
8. `src/app/(studio)/uploads/shorts/page.tsx`
9. `src/app/(studio)/assets/thumbnails/page.tsx`
10. `src/app/(studio)/settings/profile/page.tsx` *(외부 의존: header-profile-ui)*
11. (선택) `src/app/(studio)/others/page.tsx` — 기타 유틸 허브

### 신규 API 라우트 (4개)
- `src/app/api/music-gen/midis/route.ts`
- `src/app/api/music-gen/tracks/route.ts`
- `src/app/api/music-gen/renders/route.ts`
- `src/app/api/music-gen/uploads/route.ts`

### 신규 컴포넌트 (5개)
- `src/components/sidebar/NavSection.tsx`
- `src/components/sidebar/NavItem.tsx`
- `src/components/sidebar/SidebarFooter.tsx`
- `src/components/sidebar/MusixGenLogo.tsx`
- `src/hooks/useSidebarSections.ts`

### 마이그레이션 (1개)
- `src/lib/music-gen/migrations/009_nav_views.sql` — `workspace_renders`, `workspace_uploads` 테이블

> **수정 대상** (기존 파일): `src/components/SideNav.tsx`, `src/components/StudioHeader.tsx`, `src/app/(studio)/tracks/page.tsx`

---

## 7. 상태 관리 전략

| 상태 | 위치 | 지속성 |
|------|------|--------|
| 섹션 확장/축소 | `useSidebarSections` 훅 | `localStorage.sidebarSections` (JSON Set) |
| 워크스페이스 트리 확장 | 기존 `WorkspaceTree` | `localStorage.expandedWorkspaces` (기존 유지) |
| 선택 채널 | `ChannelProvider` | `localStorage.selectedChannelId` (기존 유지) |
| 선택 Suno 계정 | `SunoAccountProvider` | `localStorage.selectedSunoAccountId` (기존 유지) |
| 사이드바 접힘(모바일) | `useState` + `useMediaQuery` | 세션 단위 |
| 테마 | 기존 `ThemeToggle` | 기존 유지 |

---

## 8. WorkspaceTree 통합

- `WorkspaceTree` 컴포넌트 자체는 수정 없음 (이미 채널·Suno 계정 필터 반응)
- 새 `SideNav`의 `#워크스페이스` 섹션 내부에 `<WorkspaceTree />` 그대로 삽입
- 섹션 헤더의 "새 워크스페이스" 버튼을 `NavSection`의 액션 슬롯으로 승격 (현재 트리 내부 +버튼 유지 가능)
- MIDI 하위 트리는 `#미디파일` 전역 목록과 **중복이 아닌 보완 관계**로 유지 (트리 = 현재 작업 맥락, 목록 = 전역 필터링)

---

## 9. 오픈 질문 (decision deferred)

`.omc/plans/open-questions.md` 에 기록될 항목:

- [ ] `workspace_renders`/`workspace_uploads` 테이블이 기존 파이프라인 코드와 필드 호환인지 — 확인 후 마이그레이션을 `VIEW`로 대체할지 결정 필요 (executor 실제 스키마 점검)
- [ ] Job 큐(`/queue`)와 OpenClaw(`/openclaw`)를 새 IA에 흡수할지 "기타" 섹션에 보존할지 — 사용자 확인 필요
- [ ] 모바일 드로어 제스처(스와이프)까지 1차 범위에 포함할지 — 기본은 햄버거 버튼만 포함
- [ ] 로고 심볼을 디자이너가 따로 제공할지, SVG 인라인 초안으로 출시할지
- [ ] `header-profile-ui`가 `settings/profile` 라우트 완성 시점 — 본 계획은 링크만 연결하고 페이지 본체는 해당 팀 완료 후 머지

---

## 10. 성공 기준 (Success Criteria)

- Cloudflare Docs 스타일 섹션형 사이드바 렌더링 완료
- 7개 최상위 섹션 + 하단 프로필 푸터 정상 동작 및 URL 매핑 일치
- 3개 주요 신규 페이지(`/channels`, `/midis`, `/tracks` 개편) 및 4개 전역 목록 API 200 응답
- `WorkspaceTree` 기존 동작 회귀 없음
- `StudioHeader`의 Suno 계정 드롭다운이 `SidebarFooter`로 이전되고 중복 없음
- `009_nav_views.sql` 마이그레이션이 멱등 실행
- `header-profile-ui` 팀 작업과 `StudioHeader.tsx`·`SidebarFooter.tsx` 외 파일에서 충돌 없음
- 다크/라이트 모두에서 로고·섹션 배경·활성 하이라이트 대비 통과
