# editor-mode-context — 새 세션 킥오프 가이드 (WI-166)

이 폴더만 읽고 구현을 시작할 수 있도록 만든 self-contained 컨텍스트.
설계는 **승인 완료**, 구현은 **P1·P2·P3 완료**(2026-06-10), P4-P5 대기 상태다.
진행 상황의 진실 원천은 `records/work-items/WI-166-editor-mode-context.md`.

## 읽기 순서

1. `records/decisions/DR-114-editor-mode-context.md` (**v2** — 아키텍처 진실
   원천: 7정책, flavor-키 레지스트리, §2b 주입 모델, §6 성장 규칙 G1-G6,
   §7 disabled flavor 예상 모습, SOLID/GRASP 리뷰)
2. `features/editor-mode-context/ENGINEERING_PLAN.md` (P1-P5 실행 순서 + 게이트)
3. `records/work-items/WI-166-editor-mode-context.md` (요청 원문 6건 + scope)
4. 이 문서의 "조사 결과 지도" — 코드 재조사를 건너뛰기 위한 anchor

## 한 줄 요약

흩어진 모드 분기(infiniteCanvas/isArtboardId/visibleFrameIds 키잉/레일 prop
삼항/FSM 게이트 하드코딩/FORMAT_EDITOR_CONFIG)를
`EDITOR_MODES: Readonly<Record<DocFlavor, EditorModeContext>>` **순수 정적
레지스트리** 1곳으로 통합. 정책 7개(view/camera/input/hit/roles/insertion/
rail)는 인터페이스, 소비처는 `types.ts`만 import(빌드-그래프 게이트), 주입은
컴포지션 루트(Provider / `editorModeFor`)에서 수동으로.

행동 변경 3건(나머지는 무회귀 리팩토링):

- **P2** mixed 레일에서 "+"(새 페이지) 제거.
- **P2** slide-deck 레일에서 non-slide 섹션·슬라이드 토글·눈동자(포커스) 제거.
- **P3** page-bounded에서 비선택 페이지-내부 아이템 드래그 = **원제스처
  선택+이동** (클릭과 동일한 parent-first 해석을 드래그 move-target에도 적용).

## 조사 결과 지도 (2026-06-10, weave e2468e0 기준 — 라인은 드리프트 가능, grep으로 재확인)

### 흡수 대상 분기

- `infiniteCanvas`: `apps/web/src/pages/DesignPage.tsx` ~20 참조 (정의
  :1040대 — `formatEditorConfig(currentFlavor).canvas === "infinite"`).
  FrameStage prop으로 내려가 `cameraEnabled`/`paddingFactor 0.9|0.95`/
  `panActive = infiniteCanvas && (isSpaceDown || handMode)`/
  `useViewportCulling` 파생.
- 페이지 크롬(matte/clip): `FrameStage.tsx` ~:1784 — `props.visibleFrameIds
  !== undefined` 키잉. activePage 추론 = `visibleFrameIds !== undefined &&
  frames.length === 1 ? frames[0] : undefined`.
- `isArtboardId`/`artboardIds`: DesignPage ~15곳(:1063,:1072,:1490,:1493,
  :1520,:1625,:1773,:1817,:1854,:2349,:2682,:3043,:3058,:3070,:3072),
  FrameStage 4곳(:743 isArtboardId 정의, :836 movableTargetOrNull,
  :1402 rotate 게이트, :1490 resize 게이트), NestedFrame.tsx 2곳(:771,:773),
  hover-affordance-projector.ts 7곳, selection-context.tsx 6곳.
- 삽입: `format-editor-config.ts`의 `defaultContainer` — 소비처는
  `pages/design/hooks/use-item-add.ts` + `features/aku/agent/agent-page-target.ts`.
- 레일: DesignPage ThumbnailPanel 호출부 ~:2505-:2557 —
  `onDuplicatePage = infiniteCanvas ? undefined : …`, onSelect 안
  `if (!infiniteCanvas) setActivePageId(id)`. ThumbnailPanel 자체는
  optional-prop 슬롯 구조(prop 없으면 미렌더)라 정책을 몰라도 됨 —
  non-slide 섹션 게이트만 추가하면 됨 (`thumbnail-slide-toggle-*` :743,
  `thumbnail-nonslide-*` :823-:927, 눈동자 FocusGlyph/onCycleFocus).
- FSM 게이트: `document/interactions/interaction-mode.tsx` :90-:199 —
  단일 토큰 FSM(`requestMode`/`releaseMode`/`tokensByMode`) + 하드코딩 게이트
  `useTooltipsAllowed(idle|hand)`, `useRubberBandAllowed(idle)`,
  `useFrameSelectionAllowed(idle)`, `useEditAffordancesAllowed(idle && !peek)`.
  **FSM은 포크하지 않는다** — InputPolicy가 도달 가능 집합만 주입.

### P3 핵심 메커니즘 (이미 검증된 발견)

- 클릭 선택: `selection-context.tsx`의 `selectFromHit(hitId, intent, doc,
  current, contextRootId?)` — parent-first (contextRootId 있으면
  `trail[rootIdx+1]` = 페이지 한 단계 안).
- 드래그 이동: `FrameStage.tsx` `resolveTarget`(deepest `[data-frame-id]`
  closest) → `climbToMovable` → `movableTargetOrNull`. **클릭과 비대칭.**
- `commitFrame`이 `moveSelectionSessionRef`로 제스처당 1회 "이동 대상 선택"을
  이미 수행 → **move-target 해석만 parent-first로 바꾸면 원제스처
  선택+이동이 자동 성립.** mixed는 deepest 유지(무회귀).
- WI-163 escape hatch 보존: Cmd/Ctrl 딥클릭은 페이지 선택 허용(페이지-필
  편집), transform/delete/nudge는 계속 차단 — RolePolicy `selectable:
  "deep-only"`로 표현.

### FORMAT_EDITOR_CONFIG 소비처 (P2에서 해소 후 파일 삭제)

`DesignPage.tsx` / `PresentPage.tsx`(클립 → ViewPolicy.pageChrome) /
`use-item-add.ts` / `agent-page-target.ts`(→ InsertionPolicy.containerFor).
비-React 소비처 2곳이 실재하므로 **레지스트리는 refs 없는 순수 record**여야
한다 (DR-114 v2 변경 ③의 근거).

## 운영 제약 (이 레포 공통 — 위반 시 사고)

- **동시 세션**: 같은 weave 레포에서 다른 Claude 세션이 작업 중일 수 있다.
  `git stash` 금지, 레포-전역 git 조작 금지, **스테이징은 자기 파일만 명시
  경로로**, WI/DR 번호는 claim 전 `ls records/{work-items,decisions}/`로
  재확인 (committed-wins — HANDOFF-001, 충돌 전례 2회).
- 커밋 트레일러: weave는 `Co-Authored-By: Claude Opus 4.8
  <noreply@anthropic.com>`, OS 루트는 `chore: bump weave pointer (WI-166 — …)`.
- 게이트: weave 루트에서 `pnpm tokencheck && pnpm declarativecheck &&
  pnpm puritycheck && pnpm inheritancecheck`, `pnpm exec tsc --noEmit`,
  `pnpm vitest run`, `pnpm exec biome check --write apps/web`.
  Playwright는 **`apps/web/` cwd**에서 실행.
- **알려진 pre-existing red** (이 작업의 합격 판정에서 제외, 악화만 금지):
  `frame-handles.spec.ts:32`(WI-165 기록, WI-153 이전부터 red),
  `hover-affordance.spec.ts:58/:87` + `mode-gate-hardening.spec.ts:110`
  (WI-164 기록 — `clearAllDesigns`가 배너 dismissal 키를 지워 런치 배너가
  캔버스 좌상단을 덮는 기존 결함).
- e2e에서 coming-soon flavor(canvas-board/doc-page) 생성은 `prepareDesign`이
  DEV unlock 키(`weave.dev.unlock-flavors`)를 자동 세팅(WI-165).

## 시작 지점

`ENGINEERING_PLAN.md`의 **P1**: `src/document/editor-mode/` 골격(types/
registry/modes×4/Provider) + import-경계 게이트 + RolePolicy로 isArtboardId
산재 술어 27곳 흡수·디커미션. 행동 변화 0이 P1 합격 기준.
