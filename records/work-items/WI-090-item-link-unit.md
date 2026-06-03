# WI-090 — 아이템 링크 유닛 (URL 새 탭 / 슬라이드 이동)

Status: **Done** (2026-06-04 — Phase 1 런타임 + Phase 2 저작 UI + Phase 3 텍스트 경계 + Phase 4 정리 완료·검증)
Owner: hbpark
Updated: 2026-06-04

## Problem

사용자: **모든 아이템**(text·image·shape·line·qr·chart·frame)에 "링크 유닛"을 붙이고 싶다.
프레젠테이션 모드에서 그 링크는 (1) 새 탭으로 특정 URL을 열거나, (2) 디자인 내 특정 슬라이드로
이동한다.

## Feasibility / Decision

- **FR-018**: FEASIBLE — 모델·디스패치·URL열기·슬라이드 점프 런타임이 이미 존재. 잔여 작업은
  present 런타임 전 아이템 연결 + 저작 UI + 슬라이드 타겟 선택기.
- **DR-052**:
  1. 새 kind 없이 **`button-trigger` + `HotspotAction(external/jump-camera)`** 재사용. 점프
     타겟은 `present-${frameId}`(id 기반).
  2. 텍스트 인라인 `hyperlink`(범위 URL) vs 아이템 레벨 링크(behavior) 경계 고정.
  3. present 디스패치를 **`interactionRegistry.forItem` 단일 경로**로 통합해 모든 아이템에 연결
     (slide 전용 지름길 + orphaned `renderOverlay` 정리).

## 구현 범위 (계획)

1. **런타임 (Gap A)** — present 렌더가 각 아이템에 대해 `interactionRegistry.forItem(item)`을
   디스패치하도록 통합:
   - `PresentPage.tsx` `rootPrimitiveScenes` + `PresentFrameTree` 자식 + 슬라이드 프레임이 동일
     경로로 클릭/오버레이 발화.
   - `button-trigger` → `dispatchHotspotAction`(`external`=새 탭, `jump-camera`=`goToCameraId`).
   - `!editable`에서만 발화. 링크 달린 아이템에 `cursor:pointer`(기존 `PresentPage.tsx:131` 패턴).
2. **저작 UI (Gap B+C)** — 종류 공통 `LinkSection`(툴바/인스펙터):
   - 라디오: 없음 / URL 열기 / 슬라이드 이동.
   - URL: 입력 필드(`https://…`).
   - 슬라이드: `effectivePresentationOrder(design)` 기반 드롭다운(슬라이드 라벨 → `present-${frameId}`).
   - 저장: `weave.item.addBehavior` / `behavior.update` / `removeBehavior`(전부 History 경유).
3. **텍스트 경계** — 텍스트 섹션에서 인라인 hyperlink와 아이템 레벨 링크를 분리 노출. 클릭은
   인라인 `<a>` 우선 소비(DR-052 §2).
4. **정리** — slide 전용 `findBehavior` 지름길을 레지스트리 경로로 이전, hotspot `renderOverlay`
   부활(또는 미사용분 Decommission Sweep).

## Phase 1 (런타임) — 완료 (2026-06-04)

신규/변경 파일:

- `interactions/button-trigger.tsx` **(신규)** — `buttonTriggerAdapter`. `renderOverlay`가
  아이템 전체를 덮는 `inset:0` 투명 `<button>`(`data-testid="present-link"`,
  `data-button-action`)을 그리고 클릭 시 `dispatchHotspotAction`으로 라우팅
  (`external`→`openExternalHref`, `jump-camera`→`ctx.goToCameraId`, `next-camera`/`reveal`).
- `interactions/present-runtime-context.tsx` **(신규)** — `PresentRuntimeProvider` /
  `usePresentRuntime`로 live `PresentContext`를 재귀 렌더러까지 전달.
- `render/ItemInteractionLayer.tsx` **(신규)** — present의 **유일한 레지스트리 소비자**.
  `interactionRegistry.forItem(item)`의 모든 `renderOverlay`를 렌더(button-trigger + hotspot).
- `render/PresentFrameTree.tsx` — `FrameContent` 위·자식 앞에 `<ItemInteractionLayer>` 마운트
  → 루트 프리미티브·중첩 자식·슬라이드 프레임이 **동일 경로**로 링크 발화.
- `interactions/index.ts` — `buttonTriggerAdapter` 등록 + 신규 export.
- `pages/PresentPage.tsx` — Stage를 `PresentRuntimeProvider`로 감싸고, **슬라이드 전용
  인라인 button-trigger 경로 제거**(`PresentScene`의 `buttonBehavior`/`onAction`/`dispatchAction`
  삭제) → DR-052 §3 단일 경로 통합. hotspot `renderOverlay`(이전 orphaned)도 부활.

### 검증 (SVL) — 통과

- `pnpm typecheck` green · `pnpm biome check`(변경/신규 8파일) 무결 · Rule 6 무결.
- `pnpm test` **519 green**(신규 4: `interactions/button-trigger.test.tsx` — 어댑터 등록·
  external→`window.open(_blank)`·jump-camera→`goToCameraId`·behavior 없을 때 무렌더).
- **런타임 검증 방식**: e2e(`e2e/present-link-unit.spec.ts`)는 작성했으나 **오프라인 e2e
  하니스의 편집-영속 게이트**(위저드 이후 편집이 `/present` 리로드에 반영 안 됨; 다른 present
  상호작용 spec들이 skip된 동일 사유)로 `test.skip` 처리. 대신 `react-dom`+jsdom 컴포넌트
  테스트로 레지스트리→오버레이→디스패치 배선을 결정론적으로 검증. `/api` 모킹으로 하니스가
  편집 영속을 지원하면 unskip.

## Phase 2 (저작 UI) — 완료 (2026-06-04)

발견: 기존 `PropertiesPanel` + `interaction-rows/`에 behavior 저작 행이 있으나 **어디에도
마운트되지 않은 orphaned 레거시**였고(현 UX는 `ContextualToolbar` + per-kind `sections/`),
button-trigger 행도 **`external`은 URL 입력 없음·`jump-camera`는 슬라이드 선택기 없음**이었다.
따라서 현행 UX에 맞춰 **cross-kind `LinkSection`을 ContextualToolbar에 추가**(orphaned 패널
부활 아님).

신규/변경 파일:

- `toolbar/sections/link-mutations.ts` **(신규)** — 순수 정책: `linkModeOf`(action→모드),
  `planSetAction`/`planSetMode`(현재 behavior + 의도 → History 커맨드 descriptor). 렌더 무관 →
  단위 테스트 가능. `none↔url↔slide` 전환 시 **단일 button-trigger 유지**(중복 생성 방지:
  기존 유닛 update, 없으면 add), `none`은 remove.
- `toolbar/sections/link-section.tsx` **(신규)** — 단일 선택 아이템에 대해 `Link` 컨트롤:
  모드 Select(없음/URL/슬라이드) + URL 입력 + 슬라이드 Select(`collectPresentationIds`로
  도출, value=`present-${frameId}`). 커밋은 planner → `editor.exec`(History 경유).
- `toolbar/ContextualToolbar.tsx` — `FlexChildSection`/`GridChildSection` 옆에 `<LinkSection>`
  마운트(모든 kind 공통, self-hide는 단일 선택 외).

### 검증 (SVL) — 통과

- `pnpm typecheck` green · `pnpm biome check` 무결(경고 2건은 `flex-child-section`과 동일한
  `role="group"` 수용 패턴) · Rule 6 무결.
- `pnpm test` **529 green**(신규 10: `link-mutations.test.ts` — 모드 분류·add/update/remove·
  no-op·머지 경계).
- **저작 e2e 라이브 검증**(`e2e/link-authoring.spec.ts`, **2/2 pass**): 저작은 디자인
  페이지에서 동작 → present 영속 게이트와 무관. 도형 선택 → 툴바 `link-controls` 노출 →
  URL 모드 부착(기본 `https://`) → URL 입력·blur 커밋 → 슬라이드 모드 전환(단일 유닛
  update, `present-${frameId}`) → `Cmd+Z` 되돌림(History). + None 전환 시 behavior 제거.

## Phase 3 (텍스트 경계) — 완료 (2026-06-04)

- 텍스트가 인라인 `hyperlink`(`<a>`)와 아이템 레벨 링크(button-trigger 오버레이)를 둘 다 가질
  때 인라인 `<a>` 우선. 구현: `TextBlock.tsx` present `<a>`에 `position:relative; z-index:2`,
  `button-trigger.tsx` 오버레이에 `z-index:1`(콘텐츠 z-auto 위, 인라인 `<a>` 아래). → 글자
  클릭=인라인 링크, 빈 박스=아이템 레벨 링크. (DR-052 §2)
- 검증: `pnpm test` **530 green**(신규: 오버레이 `z-index:1` 계약 테스트 in
  `button-trigger.test.tsx`). 픽셀 히트테스트는 present e2e 게이트로 자동검증 불가 → z-index
  계약 + 코드리뷰로 고정.

## Phase 4 (정리) — 완료 (2026-06-04)

- **slide 전용 지름길 제거 + hotspot `renderOverlay` 부활**: Phase 1에서 완료.
- **슬라이드 재정렬 후 점프 타겟 유지**: 타겟이 `present-${frameId}`(id 기반, DR-052 §1)이므로
  재정렬이 behavior를 변경하지 않음 → **설계상 보장**(코드 변경 불필요). present `goToCameraId`가
  frameId로 매칭 → 순서가 바뀌어도 동일 슬라이드로 점프.
- **남은 레거시(후속 별도 WI 권고, 비범위)**: `pages/PropertiesPanel.tsx` + `pages/interaction-rows/`
  는 어디에도 마운트되지 않은 orphaned 저작 패널(hotspot/hover/animation/camera 행 포함). 이번
  WI가 만든 것이 아니라 기존 레거시 → Decommission은 별도 판단(그 행들의 저작 surface를 살릴지
  결정 후 일괄 정리/삭제).

## 검증 요약 (SVL)

- `pnpm typecheck` green · `pnpm biome check`(변경/신규 파일) 무결(경고는 기존 수용 패턴) · Rule 6 무결.
- `pnpm test` **530 green**(신규 15: 런타임 4 + 정책 10 + z-index 계약 1).
- e2e: 저작 `link-authoring.spec.ts` **2/2 pass**(라이브). 런타임 `present-link-unit.spec.ts`는
  하니스 영속 게이트로 `test.skip`(컴포넌트 테스트로 대체 검증).

## Cross-refs

- FR-018, DR-052, DR-009, WI-029
- 코드: `types.ts:383,430` · `interactions/hotspot-action.ts` · `interactions/registry.ts` ·
  `commands.ts:1460` · `PresentPage.tsx:199,272,577` · `render/PresentFrameTree.tsx` ·
  `toolbar/sections/` · `domains/TextBlock.tsx:399`
