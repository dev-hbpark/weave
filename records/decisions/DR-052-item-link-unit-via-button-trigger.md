# DR-052 — 아이템 링크 유닛: `button-trigger` 재사용 + present 레지스트리 경로 부활

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-090 · **FR:** FR-018
- **Relates:** DR-009 (InteractionBehavior 오픈 레지스트리), WI-029 (behavior 커맨드 + 텍스트
  hyperlink), CLAUDE.md Rule 6 (kind discriminant switch 금지 / 레지스트리 디스패치)

## Context

모든 아이템에 "링크 유닛"을 붙여, 프레젠테이션 모드에서 (1) 새 탭 URL 열기 또는 (2) 디자인 내
특정 슬라이드 이동을 하고 싶다(FR-018). 조사 결과 모델·디스패치·URL열기·슬라이드 점프 런타임은
이미 존재하고(아래 §재사용), 빠진 것은 present 런타임의 전 아이템 연결·저작 UI·슬라이드 타겟
선택기뿐이다. 핵심 설계 질문 세 가지를 봉인한다.

### 재사용되는 기존 자산

- `ButtonTriggerBehavior`(`types.ts:430`) + `HotspotAction`(`types.ts:383`)
- `dispatchHotspotAction` / `openExternalHref`(`interactions/hotspot-action.ts`)
- `weave.item.addBehavior` / `removeBehavior` / `behavior.update`(`commands.ts:1460,1491,1185`)
- `goToCameraId("present-"+frameId)`(`PresentPage.tsx:272`) · `effectivePresentationOrder`

## 결정 1 — 새 `link` kind를 만들지 않고 `button-trigger`를 재사용한다

"아이템 전체가 클릭 → `HotspotAction`"은 이미 `ButtonTriggerBehavior`의 정의이며, 링크 유닛은
그 action이 `external`(URL) 또는 `jump-camera`(슬라이드)인 특수형일 뿐이다. 새 kind 신설은
variant 폭증과 디스패치 분기 증가를 부르고(Rule 6 위반 리스크), 동일 동작의 두 번째 표현을
만든다. **"링크"는 UI 라벨/저작 의도로만 노출하고, 저장 모델은 `button-trigger`로 단일화**한다.

- URL: `{ kind:"button-trigger", id, action:{ type:"external", href } }`
- 슬라이드: `{ kind:"button-trigger", id, action:{ type:"jump-camera", targetId:"present-"+frameId } }`

점프 타겟은 **프레임 id 기반(`present-${frameId}`)** 으로 저장한다(step 인덱스 금지) — 슬라이드
재정렬에 견디게 하기 위함(FR-018 §트레이드오프).

## 결정 2 — 텍스트 인라인 `hyperlink`와 아이템 레벨 링크의 경계

텍스트는 인라인 `hyperlink`(URL만, `<a>` 래핑, `TextBlock.tsx:399`)와 아이템 레벨 링크가
공존할 수 있어 클릭 이중 처리가 가능하다. 경계를 다음으로 고정:

- **인라인 텍스트 범위 링크** = 기존 `hyperlink` 유지(텍스트 내부 일부에 거는 URL).
- **박스/아이템 전체 링크**(슬라이드 이동 포함) = `button-trigger` behavior.
- 한 텍스트 아이템에 둘 다 있으면 **인라인 `<a>`가 자기 영역(글자)의 클릭을 먼저 소비**하고,
  그 외 박스 영역 클릭은 아이템 레벨 behavior가 받는다.
- **구현(WI-090 Phase 3)**: present에서 인라인 `<a>`(`TextBlock.tsx`)에 `position:relative;
  z-index:2`, 아이템 레벨 링크 오버레이(`button-trigger.tsx`)에 `z-index:1`을 준다. 오버레이는
  콘텐츠(도형 fill / 이미지 / 글리프, z-auto) 위(1)지만 인라인 `<a>`(2) 아래 → 글자 클릭은
  인라인 링크, 빈 박스 영역 클릭은 아이템 레벨 링크. z-index 값 비교는 공통 스택 컨텍스트에서
  성립(둘 다 positioned, FrameContent가 자체 스택 컨텍스트를 만들지 않는 한). 픽셀 단위 히트
  테스트는 present e2e 게이트로 자동검증 불가 → 오버레이 z-index 계약을 컴포넌트 테스트로 고정
  (`button-trigger.test.tsx`).

## 결정 3 — present 디스패치를 레지스트리 경로로 부활시켜 전 아이템에 연결한다

현재 `button-trigger`는 PresentPage가 `units`를 직접 읽는 지름길이며 **슬라이드 프레임에만**
연결돼 있다(`PresentPage.tsx:577,614`). 또 `interactionRegistry.forItem` + 어댑터
`renderOverlay`(hotspot)는 등록만 되고 **호출 소비자가 없는 죽은 코드**다.

- present 렌더(`rootPrimitiveScenes` + `PresentFrameTree` 자식 + 슬라이드 프레임)가 각 아이템에
  대해 `interactionRegistry.forItem(item)`을 돌려 behavior를 디스패치하도록 **단일 경로로 통합**한다.
- 이로써 "모든 아이템 × 모든 behavior(button-trigger / hotspot / …)"가 한 곳에서 발화 → Gap A
  해소 + Rule 6/오픈레지스트리 원칙 부합 + orphaned 코드 부활(또는 명시적 Decommission).
- 클릭 발화는 **present(`!editable`)에서만** — 편집 모드 클릭은 선택을 유지(기존 패턴).

## Consequences

- (+) 새 직렬화·새 명령·새 kind 0개. 모델/undo/직렬화 변경 없음.
- (+) hotspot 서브영역 링크도 같은 경로로 자동 활성(부가 이득).
- (−) PresentPage의 슬라이드 전용 `findBehavior` 지름길을 레지스트리 경로로 이전하는 리팩터 필요
  (회귀 위험 → 슬라이드 button-trigger e2e 보존 필수).
- (−) 텍스트 이중 링크 경계는 e2e로 고정해야 함(인라인 우선 소비).

## 비채택 대안

- **신규 `link` kind**: 동작 중복·variant 폭증 → 기각(결정 1).
- **PresentPage 지름길 확장(레지스트리 우회한 채 모든 씬에 findBehavior 복붙)**: 분기 중복·죽은
  레지스트리 방치 → 기각(결정 3).
- **step 인덱스 기반 슬라이드 점프**: 재정렬에 깨짐 → 기각(결정 1, id 기반).
