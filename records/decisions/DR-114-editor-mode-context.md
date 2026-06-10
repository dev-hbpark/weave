# DR-114 — EditorModeContext: 모드별 컨텍스트 합성으로 흩어진 모드 분기 통합

- **Status**: PROPOSED v2 (설계 승인 대기 — 구현은 features/editor-mode-context/ENGINEERING_PLAN.md P1-P5)
- **Date**: 2026-06-10
- **Work Item**: WI-166
- **Origin**: 사용자 요청 6건 (아래 Requirements)
- **Supersedes**: 없음. DR-111(FORMAT_EDITOR_CONFIG)을 *흡수*한다 — config는
  레지스트리 합성으로 해소되고 (§5), no-dead-config 원칙은 성장 규칙(§6)으로 계승.
- **Revision**: v2 (2026-06-10) — Requirement 5 반영: ① 레지스트리 키를
  `CanvasMode`(2종) → **`DocFlavor`(4종)** 로 변경(§2 근거), ② 정책 필드를
  enum 위주 → **함수 위주**로(§6 성장 규칙), ③ 레지스트리를 refs-바인딩
  팩토리 → **순수 정적 record**로(§2), ④ disabled flavor 예상 모습 표(§7),
  ⑤ Requirement 6 반영: 컴포지션 루트 + 인터페이스-온리 소비처 주입 모델(§2b).

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
5. **성장 전제**: 지금의 규칙은 일부일 뿐 — 향후 변경/추가 속성이 계속 늘어날
   수 있고, 현재 disabled(coming-soon, WI-165)인 canvas-board / doc-page의
   **예상되는 모습까지 감안한** 구조여야 한다.
6. **의존성 주입**: 모드에 따라 서로 다른 디펜던시 구현체를 **조립해서
   주입**하고, 내부 구현(소비처)은 **인터페이스만으로** 구현되는 것도 고려.

## Problem — 현재 모드 분기가 흩어져 있는 곳 (실측)

| 분기 표현 | 위치 | 개수 |
| --- | --- | --- |
| `infiniteCanvas` boolean | DesignPage.tsx | ~20 참조 (pageNoun, visibleFrameIds, 카메라, 레일 onSelect/onAddPage/onDuplicatePage 삼항, backswipe…) |
| `infiniteCanvas` prop + 파생 | FrameStage.tsx | cameraEnabled, paddingFactor 0.9/0.95, panActive, useViewportCulling |
| `visibleFrameIds !== undefined` | FrameStage.tsx (~1784) | matte/clip(페이지 크롬) 키잉, activePage 추론 |
| `isArtboardId` / `artboardIds` | DesignPage(~15), FrameStage(4), NestedFrame(2), hover-affordance-projector(7), selection-context(6) | 이동/리사이즈/회전/삭제/네비게이션/QuickActionBar/호버 게이트가 각자 술어 호출 |
| `contextRootId` | selection-context.tsx selectFromHit | 클릭 선택만 parent-first — 드래그는 deepest (비대칭) |
| `defaultContainer` | format-editor-config.ts → use-item-add, agent-page-target | 삽입 대상 분기 |
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

### 1. EditorModeContext — 7개 정책의 합성체 (정책 목록은 열린 집합)

```ts
// src/document/editor-mode/types.ts
export type CanvasMode = "infinite" | "page-bounded";

export interface EditorModeContext {
  /** 디버그/telemetry/프레젠트 표면용 선언 — 소비처 분기용이 아님 (§6-G4) */
  readonly mode: CanvasMode;
  readonly view: ViewPolicy;        // 무엇이 어떻게 보이는가
  readonly camera: CameraPolicy;    // 카메라가 무엇을 할 수 있는가
  readonly input: InputPolicy;      // 어떤 제스처/FSM 전이가 마운트되는가
  readonly hit: HitPolicy;          // 포인터 히트가 어떤 아이템으로 해석되는가
  readonly roles: RolePolicy;       // 아이템의 역할과 그 역할의 능력
  readonly insertion: InsertionPolicy; // 새 아이템이 어디에 삽입되는가
  readonly rail: RailPolicy;        // 하단 패널이 어떻게 구성되는가
}
```

7개는 **현재 실측된 분기의 분류**이지 천장이 아니다 — 새 관심사(예: 내보내기
표면, 협업 커서 정책)는 새 정책 인터페이스 + 키 추가로 들어온다 (§6-G2).

### 2. EDITOR_MODES 레지스트리 — **flavor당** 합성 파일 1개, 순수 정적 record

```ts
// src/document/editor-mode/registry.ts  (Rule 6 — switch 금지, 레지스트리)
export const EDITOR_MODES: Readonly<Record<DocFlavor, EditorModeContext>> = {
  mixed: MIXED_MODE,                 // ./modes/mixed.ts
  "slide-deck": SLIDE_DECK_MODE,     // ./modes/slide-deck.ts
  "canvas-board": CANVAS_BOARD_MODE, // ./modes/canvas-board.ts
  "doc-page": DOC_PAGE_MODE,         // ./modes/doc-page.ts
};

export function editorModeFor(flavor: DocFlavor | undefined): EditorModeContext {
  return EDITOR_MODES[flavor ?? "mixed"]; // formatEditorConfig의 fallback 계승
}
```

**v2 변경 ① — 키 = `DocFlavor`(4종), `CanvasMode`(2종) 아님.** v1처럼 2종
키면 doc-page 제품화 시점에 page-bounded 합성 파일 *안에서* flavor 분기가
부활한다(§7: doc-page는 slide-deck과 같은 page-bounded라도 뷰·레일·카메라가
다르게 갈 것이 예상됨). flavor가 제품 표면의 단위이므로 레지스트리 행의
단위다. 공유 행동은 `pieces/`(조각)와 `presets/`(명명된 부분 합성)로 재사용
한다 — 키를 줄여서가 아니라. coming-soon flavor도 **현재 동작 그대로의 합성
파일을 처음부터 가진다**(canvas-board는 mixed 조각, doc-page는 slide-deck
조각 재사용) — 제품화·분화는 그 합성 파일 1개만 수정하는 일이 된다.

**v2 변경 ③ — 레지스트리는 refs 없는 순수 정적 record.** 정책 함수는 모든
가변 상태(doc, activePageId…)를 **명시적 인자**로 받는다. liveness용
`ModeStateRefs`는 React 레이어(Provider/제스처 클로저)의 소유물로 강등 —
거기서 현재 값을 읽어 정책 함수에 *인자로 넘긴다*. 근거: 소비처에 비-React
코드가 실재한다 — `agent-page-target.ts`(Aku 에이전트 retarget),
`PresentPage`(클립), 둘 다 현재 formatEditorConfig를 읽고 있다. 정책이
refs에 묶이면 이들이 소비 불가.

- 합성 파일은 `pieces/`의 공유 조각(parentFirstFrom, deepestMovable,
  fitAllFrames, fitActivePage…)을 **조립한 객체 리터럴**이다. 새 flavor =
  합성 파일 1개 + 레지스트리 1행 (OCP).
- 배포: `EditorModeProvider` + `useEditorMode()` + (제스처 훅용) `ctxRef`.
  비-React 소비처는 `editorModeFor(flavor)`를 직접 호출.

### 2b. 주입 모델 — 컴포지션 루트 1곳, 소비처는 인터페이스만 (Requirement 6)

모드별로 서로 다른 구현체를 **조립해서 주입**하고, 내부 구현은 정책
**인터페이스만 알고** 동작한다. 레이어 계약:

```
[인터페이스]   types.ts        — ViewPolicy, HitPolicy … (소비처가 아는 전부)
[구현체]       pieces/*        — 인터페이스를 만족하는 순수 함수/값 조각
[조립]         modes/<flavor>  — 조각을 골라 정책 구현체로 합성 (객체 리터럴)
[컴포지션 루트] registry.ts + EditorModeProvider
                              — flavor → 합성 컨텍스트 해석, 주입 시작점
[소비처]       FrameStage, selection-context, FSM 게이트, 레일 호스트,
              use-item-add, agent-page-target, PresentPage
                              — 정책 인터페이스 타입만 import, 구현체·조각·
                                레지스트리 import 금지
```

주입 규칙 (하드 게이트):

- **소비처는 `types.ts`만 import한다.** `pieces/`·`modes/`·`registry.ts`를
  import하는 소비처는 경계 위반 — dependency-cruiser 류 build-graph 규칙으로
  CI에서 강제한다(워크스페이스 spine: "레이어 경계는 컨벤션이 아니라
  빌드 그래프 규칙"). 컴포지션 루트(Provider + `editorModeFor` 호출부)만
  레지스트리를 알 수 있는 유일한 장소다.
- **주입 수단은 수동 주입뿐**: React 소비처 = Provider/props, 순수 소비처 =
  함수 인자로 정책을 받는다 (`agent-page-target(ctx.insertion, …)`).
  데코레이터/`reflect-metadata` DI 컨테이너는 워크스페이스 금지 원칙대로
  도입하지 않는다 — 레지스트리 record + 명시적 전달이 컨테이너의 역할을
  전부 대체한다.
- **DI(인스턴스 조회)와 capability dispatch(데이터 × 행동)는 분리 유지**
  (spine 원칙): EDITOR_MODES는 *모드 → 정책 구현체* 조회(DI 레지스트리)
  이고, RolePolicy.capabilities는 *역할 → 능력* dispatch다. 하나의 거대
  레지스트리로 합치지 않는다.
- **테스트 이점이 주입의 1차 효용**: 소비처 단위 테스트는 레지스트리를
  거치지 않고 가짜 정책(`{ moveTarget: () => "x" }`)을 직접 주입한다 —
  flavor를 만들 필요도, React 트리를 세울 필요도 없다. HitPolicy 조각
  테스트와 소비처 테스트가 완전히 분리된다.

### 3. 정책별 흡수 대상

| 정책 | 형태(요약 — 함수 위주, §6-G3) | 흡수하는 기존 분기 |
| --- | --- | --- |
| **ViewPolicy** | `visibleFrames(doc, activePageId): Ids`, `pageChrome: boolean` | visibleFrameIds memo, matte/clip 키잉, activePage 추론. PresentPage 클립도 여기서 읽음 |
| **CameraPolicy** | `fitBox(doc, activePageId): Box \| undefined`, `clampPan(current, proposed): Pan`, `paddingFactor: number`, `userZoom: boolean` | cameraEnabled, panActive, paddingFactor, WI-157 pageFitBox, backswipe 게이트. pan은 enum이 아니라 **clamp 함수** — infinite=항등, page-bounded=고정, (예상) doc-page=세로만 허용이 *새 조각*으로 들어옴, 소비처 무수정 (§7) |
| **InputPolicy** | `bindings: ReadonlySet<GestureBinding>`, `gates: Record<GateKey, ReadonlySet<Mode>>` | FSM allowed-gate 하드코딩 리스트, hand/rubber-band 마운트 여부. **FSM은 단일 유지** — 컨텍스트는 도달 가능한 전이/바인딩만 구성 |
| **HitPolicy** | `selectTarget(hit, doc, ctx)`, `moveTarget(hit, doc, ctx)` | selectFromHit의 contextRootId 분기 + resolveTarget의 deepest 해석. **통합이 Requirement 1을 자동 해결** (아래) |
| **RolePolicy** | `roleOf(doc, id): ItemRole` + `capabilities: Record<ItemRole, ItemCapabilities>` | isArtboardId ×2, artboardIds set, 이동/리사이즈/회전/삭제/네비/호버/QuickActionBar 게이트 전부. lock(DR-061)은 직교 — 유효 능력 = role ∩ lock. `ItemRole`은 정책이 소유하는 열린 문자열 union — 새 역할(예: doc-page의 "flow-block")은 새 capabilities 행 |
| **InsertionPolicy** | `containerFor(doc, activePageId): Id \| undefined` | FORMAT_EDITOR_CONFIG.defaultContainer (use-item-add + agent-page-target 양쪽) |
| **RailPolicy** | 아래 §4 | onDuplicatePage 삼항, onSelect 내 분기, (신규) 섹션/버튼 구성 |

**HitPolicy가 Requirement 1을 해결하는 방식**: `commitFrame`은 이미 제스처당
1회 이동 대상을 선택한다(`moveSelectionSessionRef`). 따라서 move-target
해석만 parent-first로 바꾸면 원제스처 선택+이동이 *자동으로* 나온다.

- mixed: `select = parentFirst(docRoot)`, `move = deepestMovable` —
  **현재 행동 그대로** (무회귀).
- slide-deck: `select = move = parentFirst(activePage)` — 페이지 직속
  자식이 한 번에 선택+이동 (행동 변경, P3).

### 4. RailPolicy (Requirement 4)

```ts
export interface RailPolicy {
  /** 레일 자체를 렌더하는가. (예상) canvas-board는 페이지 개념이 없어
   *  레일 무용 → false 후보 (§7). */
  readonly visible: boolean;
  /** 페이지(presentationOrder 멤버) 섹션 외에 non-slide 섹션을 렌더하는가. */
  readonly nonSlideSection: boolean;
  /** WI-072 슬라이드 멤버십 토글(DeckGlyph). non-slide 섹션이 없으면 무의미. */
  readonly slideToggle: boolean;
  /** WI-039 눈동자 포커스 사이클(dim/isolate). 한 페이지씩만 보이면 무의미. */
  readonly focusCycle: boolean;
  /** WI-153 P2 "+" 새 페이지 타일. */
  readonly addPage: boolean;
  /** WI-155 페이지 복제 footer 액션. */
  readonly duplicatePage: boolean;
  /** 레일 클릭이 active page를 전환하는가 (WI-153 P2). */
  readonly clickActivatesPage: boolean;
}
```

| 필드 | mixed | slide-deck | canvas-board (예상) | doc-page (예상) |
| --- | --- | --- | --- | --- |
| visible | true | true | **false 후보** | true |
| nonSlideSection | true | **false** | — | false |
| slideToggle | true | **false** | — | false |
| focusCycle | true | **false** | — | false |
| addPage | **false** | true | — | true |
| duplicatePage | false (WI-155) | true | — | true |
| clickActivatesPage | false | true | — | true |

(canvas-board/doc-page 열은 §7의 예상 — 합성 파일 초기값은 현재 동작 유지,
제품화 시 그 파일만 수정.)

ThumbnailPanel은 **RailPolicy를 모른다** — DesignPage 호출부가 정책을 읽어
기존 optional prop(`onAddPage`/`onToggleSlide`/`onCycleFocus`/
`onDuplicatePage`)을 채우거나 `undefined`로 비운다. 패널의 "prop이 없으면
렌더 안 함" 패턴이 이미 선언적 슬롯이므로 패널 변경은 non-slide 섹션
게이트 추가 정도로 최소화된다.

주의 — **행동 변경 2건이 RailPolicy에 포함**된다 (P2에서 e2e로 고정):

- mixed 레일에서 "+"(새 페이지) 제거 — 현재는 양 모드 모두 노출.
- slide-deck 레일에서 슬라이드 토글·눈동자·non-slide 섹션 제거 — 현재는
  양 모드 모두 노출.

### 5. FORMAT_EDITOR_CONFIG의 거취 — 해소(dissolve)

`FormatEditorConfig`는 EDITOR_MODES로 완전 흡수된다: `canvas` →
`ctx.mode`(선언 메타데이터), `defaultContainer` → `InsertionPolicy`,
flavor-fallback → `editorModeFor()`. 소비처 4곳(DesignPage, PresentPage,
use-item-add, agent-page-target)이 모두 정책을 읽도록 치환 후 파일 삭제
(디커미션 스윕 — DR-111의 "합의해야 하는 죽은 필드 금지"는 §6-G5로 계승).

### 6. 성장 규칙 (Requirement 5 — 속성이 계속 늘어난다는 전제)

- **G1. 규칙 추가 = 기존 정책에 필수 필드 추가.** optional 금지 — 필수
  필드여야 tsc가 4개 합성 파일 전부에 결정을 강제한다 (WI-165
  `availability` 필수-필드 패턴). "기본값으로 숨은 합의"가 생기지 않는다.
- **G2. 관심사 추가 = 새 정책 인터페이스 + EditorModeContext 키 추가.**
  기존 정책이 비대해지면(필드 5±2 초과 경고) 분할 — 소비처는 자기 정책만
  import하므로(ISP) 분할 비용이 낮다.
- **G3. 소비처가 분기할 enum 금지 — 행동은 함수로.** `pan: "free"|"none"`
  처럼 소비처에서 `switch`를 유발하는 필드는 설계 거부. 대신
  `clampPan(current, proposed)` 같은 **호출만 하면 되는 함수**로 — 새 변형
  (세로 전용 팬, 스냅 팬)은 새 조각 함수이고 소비처는 무수정 (Rule 6,
  tell-don't-ask). enum이 허용되는 경우는 소비처가 분기 없이 *통과만*
  시키는 값(`paddingFactor` 같은 수치, boolean 게이트)뿐.
- **G4. `ctx.mode ===` 인라인 비교 금지.** 분기가 필요해 보이면 그 분기는
  정책 필드로 승격하라는 신호다. declarativecheck 패턴 추가 검토.
- **G5. 파생 가능한 필드 금지** (DR-111 계승): 다른 필드와 항상 합의해야
  하는 필드는 죽은 config — 조각/함수로 파생.
- **G6. 새 flavor = 합성 파일 1개 + 레지스트리 1행.** 공유는 `pieces/` +
  `presets/`(명명된 부분 합성, 예: `pageBoundedRailPreset`)로 — 단,
  preset 스프레드 뒤에 숨지 말 것: 합성 파일은 무엇을 받아들이고 무엇을
  덮는지 읽혀야 한다.

### 7. Disabled flavor 예상 모습 — 구조 검증 (Requirement 5)

커밋이 아니라 **설계 스트레스 테스트**다. 이 예상들이 §2(flavor 키),
§6-G3(함수형 필드), RailPolicy.visible의 근거다.

| | canvas-board (FigJam류 무한 보드 예상) | doc-page (Word류 문서 예상) |
| --- | --- | --- |
| mode | infinite | page-bounded |
| view | mixed와 동일(전체 프레임) — 페이지 개념 자체가 없음 | **세로 스크롤 연속 페이지 스택** 가능성: `visibleFrames`가 [activePage] 아닌 전체 페이지 + 배치 파생 — ViewPolicy가 *함수*라서 새 조각으로 수용, 소비처 무수정 |
| camera | 자유 팬/줌 (mixed 조각 재사용) | 세로 팬만 허용 + 가로 고정 — `clampPan` *함수*라서 새 조각 1개 (enum이었다면 소비처 전부 재오픈) |
| hit | deepestMovable (보드는 깊은 직접 조작) | parentFirst(activePage)? 또는 텍스트 플로우 우선 — HitPolicy 함수 교체로 수용 |
| roles | stage 없음 (mixed 동일) | 페이지=stage + (예상) "flow-block" 역할 추가 — ItemRole union 확장 + capabilities 행 추가 |
| insertion | root | active-page + 텍스트 커서 위치 — `containerFor`가 함수라서 수용 |
| rail | **visible: false 후보** (페이지 없음; 미니맵은 별도 관심사 → G2 새 정책) | 페이지 리스트(눈동자/토글 없음, add/dup 있음) |
| input | mixed 조각 + 보드용 quick-add 바인딩 추가 | 텍스트 편집 우선 게이트 |

검증 결과: 위 분화 전부가 "합성 파일 수정 + 조각 추가"로 수용되고 소비처
재오픈이 없다 — v1(2종 키, enum 필드)에서는 view 스택·세로 팬·레일 부재
3건이 모두 소비처 분기를 강제했다.

## SOLID + GRASP Review (.claude/skills/solid-grasp-review)

**Surfaces**: `editor-mode/types.ts`(공개 인터페이스), `registry.ts`(확장점),
`modes/{mixed,slide-deck,canvas-board,doc-page}.ts`(합성), `pieces/*`(공유
조각), `presets/*`(부분 합성), `EditorModeProvider`(React 경계).

| 원칙 | 평가 | 근거 |
| --- | --- | --- |
| **S**RP | ✅ | 정책 1개 = 관심사 1개. 합성 파일은 조립만, 조각은 규칙 1개만. 비대해지면 G2 분할 |
| **O**CP | ✅ | 새 flavor = 합성 파일 + 레지스트리 1행. 새 행동 변형 = 새 조각 함수(G3). 소비처(FrameStage, ThumbnailPanel 호출부, FSM 게이트, PresentPage, agent retarget) 무수정 — §7로 스트레스 테스트 완료 |
| **L**SP | ✅ | 모든 EditorModeContext는 동일 계약 — 소비처는 어느 flavor인지 모른 채 정책만 호출. `mode` 필드는 선언 메타데이터, 분기용 아님 (G4 게이트) |
| **I**SP | ✅ | FrameStage는 hit/roles/camera만, ThumbnailPanel 호출부는 rail만, FSM은 input만, agent-page-target은 insertion만 의존. god-config 아님 |
| **D**IP | ✅ | 소비처는 `types.ts` 인터페이스만 import(§2b 빌드-그래프 게이트). 구체 조각·합성·레지스트리는 컴포지션 루트 전용. 주입은 수동(Provider/props/인자) — 데코레이터 DI 금지 원칙 준수 |

**GRASP**: Information Expert(역할·능력의 진실 원천 = RolePolicy 한 곳),
Polymorphism(모드별 행동 = 합성된 정책 함수, 분기 아님 — Rule 6 + G3),
Protected Variations(소비처는 flavor 추가/규칙 변화로부터 차폐 — §7 검증),
Pure Fabrication(EditorModeContext는 도메인 객체가 아닌 조립 산물),
Low Coupling/High Cohesion(정책별 의존 절단), Creator(레지스트리가 보유).

**Boundaries**: 정책 = 순수 모듈(`src/document/editor-mode/` — React import
금지, puritycheck 대상; 가변 상태는 전부 명시적 인자). React 연동 =
`EditorModeProvider` 1파일. 소비처 → `types.ts`만(§2b) — `pieces/`·`modes/`·
`registry.ts` import는 빌드-그래프 규칙으로 CI 차단. 테스트는 가짜 정책
직접 주입.

**Anti-patterns avoided**: switch-on-mode(레지스트리로), boolean prop 증식
(`infiniteCanvas` prop 자체를 제거), god-object(정책 분할 + G2),
소비처-분기 enum(G3 함수로), 훅으로 정책 구현(순수 함수 + 인자),
숨은 기본값(G1 필수 필드), 상속(합성 파일은 조각 조립 — `extends` 0).

## Alternatives rejected

1. **`infiniteCanvas` boolean을 더 내려보내기** — 분기 지점이 늘수록 비용
   선형 증가, Requirement 2 정면 위반.
2. **FSM을 모드별로 포크** — 토큰 부기/전이 로직 중복. FSM은 단일 기계 +
   InputPolicy가 구성만 주입하는 편이 SRP/DRY 모두 우위.
3. **FORMAT_EDITOR_CONFIG에 필드 계속 추가** — config가 god-object화.
   레지스트리 합성으로 해소(§5).
4. **클래스 계층(BaseMode → InfiniteMode/PageBoundedMode)** — 상속 금지
   원칙(워크스페이스 spine) 위반. 합성 파일 + 조각으로 동일 효과.
5. **(v1) `CanvasMode` 2종 키 레지스트리** — doc-page 분화 시점에 합성 파일
   내부 flavor 분기 부활 (§7 스트레스 테스트 탈락). flavor 키로 교체.
6. **(v1) refs-바인딩 합성 팩토리 `(refs) => ctx`** — 비-React 소비처
   (PresentPage, agent-page-target)가 소비 불가. 순수 정적 record + 명시적
   인자로 교체.

## Verification 핵심 (상세는 ENGINEERING_PLAN)

- P1/P2는 행동 동일(무회귀) — 기존 e2e green이 곧 증명. P2의 레일 구성
  변경 2건 + P3 원제스처 선택+이동은 신규 e2e로 고정.
- 정책 순수성: puritycheck 경로에 `editor-mode/` 포함, React import 금지.
- `ctx.mode ===` 인라인 비교 금지(G4) — declarativecheck 커스텀 패턴 추가 검토.
- coming-soon flavor 합성 파일도 P1부터 존재(현재 동작 합성) — 레지스트리
  Record가 필수 키라 tsc가 강제.
