# DR-114 — EditorModeContext: 모드별 컨텍스트 합성으로 흩어진 모드 분기 통합

- **Status**: PROPOSED (설계 승인 대기 — 구현은 features/editor-mode-context/ENGINEERING_PLAN.md P1-P5)
- **Date**: 2026-06-10
- **Work Item**: WI-166
- **Origin**: 사용자 요청 3건 (아래 Requirements)
- **Supersedes**: 없음. DR-111(FORMAT_EDITOR_CONFIG)을 *확장*한다 — config의
  `canvas` 필드는 flavor→mode 매핑으로 살아남고, `defaultContainer`는
  InsertionPolicy로 흡수된다.

## Requirements (사용자 요청 원문 요약)

1. **원제스처 선택+이동**: 프레젠테이션(page-bounded) 모드에서 페이지 내부
   아이템은 "프레임 선택 → 내부 아이템 선택 → 이동"의 단계 없이, 디자인의
   첫 번째 자식 아이템처럼 **한 번에 선택+이동**되어야 한다.
2. **분기 금지, 컨텍스트 합성**: 이런 세부 규칙이 계속 달라지는 것을 모드별
   `if` 분기로 관리하지 않는다. **모드별로 컨텍스트를 다르게 구성**하고, 그
   컨텍스트에 따라 **다형성으로 준비된 코드 조각들이 모여서 동작**하는 구조.
3. **스테이트머신 + 뷰도 컨텍스트가 결정**: 사용자 인풋을 처리하는 상태머신의
   상태 구성, 한 페이지 모드 뷰 vs 무한 캔버스 뷰 — 모두 에디터 모드
   컨텍스트를 어떻게 구성하느냐에 따라 각각의 스테이트와 뷰가 세팅되어야 한다.
4. **하단 패널(레일)도 선언적으로**: 모드별로 하단 패널 구성이 달라야 한다 —
   믹스드는 새 페이지 추가가 불필요하고, 프레젠테이션은 페이지 이외의 프레임을
   표시할 필요가 없으므로 슬라이드 멤버십 토글 버튼도, (한 페이지씩만 보이므로)
   눈동자(포커스) 아이콘도 불필요하다. 이것도 컨텍스트로 선언적으로 관리한다.

## Problem — 현재 모드 분기가 흩어져 있는 곳 (실측)

| 분기 표현 | 위치 | 개수 |
| --- | --- | --- |
| `infiniteCanvas` boolean | DesignPage.tsx | ~20 참조 (pageNoun, visibleFrameIds, 카메라, 레일 onSelect/onAddPage/onDuplicatePage 삼항, backswipe…) |
| `infiniteCanvas` prop + 파생 | FrameStage.tsx | cameraEnabled, paddingFactor 0.9/0.95, panActive, useViewportCulling |
| `visibleFrameIds !== undefined` | FrameStage.tsx (~1784) | matte/clip(페이지 크롬) 키잉, activePage 추론 |
| `isArtboardId` / `artboardIds` | DesignPage(~15), FrameStage(4), NestedFrame(2), hover-affordance-projector(7), selection-context(6) | 이동/리사이즈/회전/삭제/네비게이션/QuickActionBar/호버 게이트가 각자 술어 호출 |
| `contextRootId` | selection-context.tsx selectFromHit | 클릭 선택만 parent-first — 드래그는 deepest (비대칭) |
| `defaultContainer` | format-editor-config.ts → 삽입 경로 | 삽입 대상 분기 |
| 레일 prop 삼항 | DesignPage ThumbnailPanel 호출부 | `onDuplicatePage = infiniteCanvas ? undefined : …`, onSelect 안 `if (!infiniteCanvas)` |
| FSM allowed-gate 하드코딩 | interaction-mode.tsx | useTooltipsAllowed(idle\|hand) 등 모드 리스트 인라인 |

증상 1 — **클릭/드래그 비대칭**: 클릭 선택은 `selectFromHit`이 parent-first
(contextRootId 한 단계 안)로 해석하지만, 드래그 이동의 `resolveTarget`은
deepest `[data-frame-id]` → `climbToMovable`로 해석한다. 그래서 page-bounded
에서 비선택 내부 아이템을 바로 드래그하면 깊은 자식이 잡힌다 — Requirement 1
의 직접 원인.

증상 2 — **새 모드 추가 비용**: canvas-board/doc-page를 제품화(WI-165에서
coming-soon 처리)하려면 위 표의 모든 지점을 다시 만져야 한다. OCP 위반.

증상 3 — **규칙의 진실 원천 부재**: "아트보드는 이동 불가"가 FrameStage
movableTargetOrNull, 리사이즈 게이트 :1490, 회전 게이트 :1402, DesignPage
삭제 ×3, NestedFrame 등에 *각각* 구현되어 있다. Information Expert 부재.

## Decision

### 1. EditorModeContext — 7개 정책의 합성체

```ts
// src/document/editor-mode/types.ts
export type CanvasMode = "infinite" | "page-bounded"; // = FormatEditorConfig.canvas

export interface EditorModeContext {
  readonly mode: CanvasMode;
  readonly view: ViewPolicy;        // 무엇이 보이는가 (한 페이지 vs 전체)
  readonly camera: CameraPolicy;    // 카메라가 무엇을 할 수 있는가
  readonly input: InputPolicy;      // 어떤 제스처/FSM 전이가 마운트되는가
  readonly hit: HitPolicy;          // 포인터 히트가 어떤 아이템으로 해석되는가
  readonly roles: RolePolicy;       // 아이템의 역할과 그 역할의 능력
  readonly insertion: InsertionPolicy; // 새 아이템이 어디에 삽입되는가
  readonly rail: RailPolicy;        // 하단 패널이 어떻게 구성되는가
}
```

### 2. EDITOR_MODES 레지스트리 — 모드당 합성 파일 1개

```ts
// src/document/editor-mode/registry.ts  (Rule 6 — switch 금지, 레지스트리)
export const EDITOR_MODES: Readonly<
  Record<CanvasMode, (refs: ModeStateRefs) => EditorModeContext>
> = {
  infinite: composeInfiniteMode,        // ./modes/infinite.ts
  "page-bounded": composePageBoundedMode, // ./modes/page-bounded.ts
};
```

- 합성 파일은 `pieces/`의 공유 조각(parentFirstFrom, deepestMovable,
  fitAllFrames, fitActivePage…)을 **조립**만 한다. 새 모드 = 합성 파일 1개
  + 레지스트리 1행 (OCP).
- **정책은 순수 data + 함수다. 훅이 아니다.** React 연동(컨텍스트 배포,
  메모, ref 동기화)은 컴포넌트 레이어에 남는다. liveness는 단일
  `ModeStateRefs`(activePageId ref, doc ref)로 해결 — deps-[] 안정 제스처
  클로저가 stale 없이 최신 상태를 읽는다.
- 배포: `EditorModeProvider` + `useEditorMode()` + (제스처 훅용) `ctxRef`.

### 3. 정책별 흡수 대상

| 정책 | 형태(요약) | 흡수하는 기존 분기 |
| --- | --- | --- |
| **ViewPolicy** | `visibleFrames(doc, activePageId)`, `pageChrome: boolean` | visibleFrameIds memo, matte/clip 키잉, activePage 추론 |
| **CameraPolicy** | `pan: "free"\|"none"`, `zoom: "user"\|"fit-page"`, `fitBox(...)`, `paddingFactor` | cameraEnabled, panActive, paddingFactor, WI-157 pageFitBox, backswipe 게이트 |
| **InputPolicy** | `bindings: ReadonlySet<GestureBinding>`, `gates: Record<GateKey, ReadonlySet<Mode>>` | FSM allowed-gate 하드코딩 리스트, hand/rubber-band 마운트 여부. **FSM은 단일 유지** — 컨텍스트는 도달 가능한 전이/바인딩만 구성 |
| **HitPolicy** | `selectTarget(hit, doc, current)`, `moveTarget(hit, doc, current)` | selectFromHit의 contextRootId 분기 + resolveTarget의 deepest 해석. **통합이 Requirement 1을 자동 해결** (아래) |
| **RolePolicy** | `roleOf(doc, id): "stage"\|"element"` + `ROLE_CAPABILITIES: Record<Role, ItemCapabilities>` | isArtboardId ×2, artboardIds set, 이동/리사이즈/회전/삭제/네비/호버/QuickActionBar 게이트 전부. lock(DR-061)은 직교 — 유효 능력 = role ∩ lock |
| **InsertionPolicy** | `containerFor(doc, activePageId)` | FORMAT_EDITOR_CONFIG.defaultContainer |
| **RailPolicy** | 아래 §4 | onDuplicatePage 삼항, onSelect 내 분기, (신규) 섹션/버튼 구성 |

**HitPolicy가 Requirement 1을 해결하는 방식**: `commitFrame`은 이미 제스처당
1회 이동 대상을 선택한다(`moveSelectionSessionRef`). 따라서 move-target
해석만 parent-first로 바꾸면 원제스처 선택+이동이 *자동으로* 나온다.

- infinite: `select = parentFirst(docRoot)`, `move = deepestMovable` —
  **현재 행동 그대로** (무회귀).
- page-bounded: `select = move = parentFirst(activePage)` — 페이지 직속
  자식이 한 번에 선택+이동 (행동 변경, P3).

### 4. RailPolicy (Requirement 4)

```ts
export interface RailPolicy {
  /** 페이지(presentationOrder 멤버) 섹션 외에 non-slide 섹션을 렌더하는가.
   *  page-bounded: false — 페이지 이외 프레임은 레일에 없다. */
  readonly nonSlideSection: boolean;
  /** WI-072 슬라이드 멤버십 토글(DeckGlyph). non-slide 섹션이 없으면 토글의
   *  의미 자체가 없으므로 page-bounded에서 false. */
  readonly slideToggle: boolean;
  /** WI-039 눈동자 포커스 사이클(dim/isolate). 한 페이지씩만 보이는
   *  page-bounded에서는 무의미 — false. */
  readonly focusCycle: boolean;
  /** WI-153 P2 "+" 새 페이지 타일. infinite(mixed)는 캔버스에 직접 추가하므로
   *  불필요 — false. page-bounded — true. */
  readonly addPage: boolean;
  /** WI-155 페이지 복제 footer 액션. infinite는 캔버스측 복제(0.02 nudge)
   *  유지 — false. */
  readonly duplicatePage: boolean;
  /** 레일 클릭이 active page를 전환하는가 (WI-153 P2). */
  readonly clickActivatesPage: boolean;
}
```

| 필드 | infinite (mixed) | page-bounded (slide-deck/doc-page) |
| --- | --- | --- |
| nonSlideSection | true | **false** |
| slideToggle | true | **false** |
| focusCycle | true | **false** |
| addPage | **false** | true |
| duplicatePage | false (WI-155 결정 유지) | true |
| clickActivatesPage | false | true |

ThumbnailPanel은 **RailPolicy를 모른다** — DesignPage 호출부가 정책을 읽어
기존 optional prop(`onAddPage`/`onToggleSlide`/`onCycleFocus`/
`onDuplicatePage`)을 채우거나 `undefined`로 비운다. 패널의 "prop이 없으면
렌더 안 함" 패턴이 이미 선언적 슬롯이므로 패널 변경은 non-slide 섹션
게이트 추가 정도로 최소화된다.

주의 — **행동 변경 2건이 RailPolicy에 포함**된다 (P2에서 e2e로 고정):

- mixed 레일에서 "+"(새 페이지) 제거 — 현재는 양 모드 모두 노출.
- page-bounded 레일에서 슬라이드 토글·눈동자·non-slide 섹션 제거 — 현재는
  양 모드 모두 노출.

### 5. FORMAT_EDITOR_CONFIG의 거취

`FormatEditorConfig`는 `canvas: CanvasMode` 한 필드로 수렴한다 — flavor→mode
매핑만 담당. `defaultContainer`는 InsertionPolicy로 이동(같은 변경에서
필드 삭제 — DR-111의 "canvas와 합의해야 하는 죽은 필드 금지" 원칙 계승).

### 6. 디커미션 스윕 (구현 완료 시점)

`infiniteCanvas` boolean prop + DesignPage ~20 참조, `isArtboardId`/
`artboardIds` 흩어진 술어, `visibleFrameIds !== undefined` 키잉, 레일 prop
삼항 — 모두 각 phase의 **같은 변경에서** 제거한다. 흡수가 끝났는데 술어가
남아 있으면 두 진실 원천이 생긴다.

## SOLID + GRASP Review (.claude/skills/solid-grasp-review)

**Surfaces**: `editor-mode/types.ts`(공개 인터페이스), `registry.ts`(확장점),
`modes/{infinite,page-bounded}.ts`(합성), `pieces/*`(공유 조각),
`EditorModeProvider`(React 경계).

| 원칙 | 평가 | 근거 |
| --- | --- | --- |
| **S**RP | ✅ | 정책 1개 = 관심사 1개(뷰/카메라/입력/히트/역할/삽입/레일). 합성 파일은 조립만, 조각은 규칙 1개만 |
| **O**CP | ✅ | 새 모드 = 합성 파일 + 레지스트리 1행. 소비처(FrameStage, ThumbnailPanel 호출부, FSM 게이트) 무수정. 기존 `switch`성 분기(isArtboardId 산재)가 닫힌 목록이었던 것을 해소 |
| **L**SP | ✅ | 모든 EditorModeContext는 동일 계약 — 소비처는 어느 모드인지 모른 채 정책만 호출. `mode` 필드는 디버그/telemetry용이지 분기용이 아님 (분기하면 회귀 — P1 게이트에서 `ctx.mode ===` 비교를 declarativecheck 패턴으로 잡음) |
| **I**SP | ✅ | FrameStage는 hit/roles/camera만, ThumbnailPanel 호출부는 rail만, FSM은 input만 의존. 한 덩어리 god-config가 아니라 정책별 인터페이스 분리 |
| **D**IP | ✅ | 소비처 → `EditorModeContext` 추상에 의존. 구체 합성은 레지스트리 뒤. React 연동은 Provider 한 곳 |

**GRASP**: Information Expert(역할·능력의 진실 원천 = RolePolicy 한 곳),
Polymorphism(모드별 행동 = 합성된 정책 객체, 분기 아님 — Rule 6),
Protected Variations(소비처는 모드 추가/규칙 변화로부터 차폐),
Pure Fabrication(EditorModeContext는 도메인 객체가 아닌 조립 산물),
Low Coupling/High Cohesion(정책별 의존 절단), Creator(레지스트리가 생성).

**Boundaries**: 정책 = 순수 모듈(`src/document/editor-mode/` — React import
금지, puritycheck 대상). React 연동 = `EditorModeProvider` 1파일.
ThumbnailPanel/FrameStage는 정책 *값*만 받고 레지스트리를 직접 import하지
않는다(테스트에서 정책 직접 주입 가능).

**Anti-patterns avoided**: switch-on-mode(레지스트리로), boolean prop 증식
(`infiniteCanvas` prop 자체를 제거), god-object(정책 7분할), 훅으로 정책
구현(순수 함수 + refs), 상속(합성 파일은 조각 조립 — `extends` 0).

## Alternatives rejected

1. **`infiniteCanvas` boolean을 더 내려보내기** — 분기 지점이 늘수록 비용
   선형 증가, Requirement 2 정면 위반.
2. **FSM을 모드별로 포크** — 토큰 부기/전이 로직 중복. FSM은 단일 기계 +
   InputPolicy가 구성만 주입하는 편이 SRP/DRY 모두 우위.
3. **FORMAT_EDITOR_CONFIG에 필드 계속 추가** — config가 god-object화.
   flavor→mode 매핑(1필드)과 모드→정책 합성(레지스트리)의 2단 분리가 ISP.
4. **클래스 계층(BaseMode → InfiniteMode/PageBoundedMode)** — 상속 금지
   원칙(워크스페이스 spine) 위반. 합성 파일 + 조각으로 동일 효과.

## Verification 핵심 (상세는 ENGINEERING_PLAN)

- P1/P2는 행동 동일(무회귀) — 기존 e2e green이 곧 증명. P2의 레일 구성
  변경 2건 + P3 원제스처 선택+이동은 신규 e2e로 고정.
- 정책 순수성: puritycheck 경로에 `editor-mode/` 포함, React import 금지.
- `ctx.mode ===` 인라인 비교 금지 — declarativecheck 커스텀 패턴 추가 검토.
