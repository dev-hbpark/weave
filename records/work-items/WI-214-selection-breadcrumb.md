# WI-214 — 선택 브레드크럼: 꽉 찬 중첩 프레임을 항상 선택 가능하게

- **Status:** DONE (구현·타입체크·단위검증·e2e·라이브 육안 검증 전부 완료) · 2026-06-13
- **DR:** DR-137 (브레드크럼 배치·동작·라벨 결정)
- **Relates:** WI-033(parent-first 휴리스틱·우클릭 레이어 피커·Shift+Enter drillUp — 기존 탈출구),
  WI-163(페이지=아트보드 deep-only), WI-166(EditorModeContext)
- **Origin:** 운영자 질문 — "중첩된 프레임 안에 빈틈없이 아이템들이 가득 차 있다면 해당 프레임을
  선택할 방법이 없다. 사용성을 어떻게 개선할까?"

## 문제 (Product Discovery)

**사용자 문제:** 자식들이 부모 프레임을 빈틈없이 덮으면(flex/grid 가득 채움) 캔버스의 어느 지점을
클릭해도 항상 자식이 잡힌다. 부모 컨테이너를 선택할 빈 공간이 없어 사용자는 "선택 불가"로 체감하고
포기한다.

**진짜 병목 = 기능이 아니라 발견성.** weave에는 이미 이 케이스를 위한 탈출구가 둘 있다:

1. **우클릭 → 레이어 피커**(`layer-picker/LayerPickerMenu.tsx` + `hit-test.ts:findFramesAtPoint`)
   — 클릭 지점을 덮는 모든 프레임을 깊이순으로 리스트. 꽉 찬 컨테이너도 선택 가능.
2. **자식 선택 후 Shift+Enter**(`tooltip/editor-hotkeys.ts:372` drillUp → `selection-context.parentOf`)
   — 부모로 한 단계 올라감.

둘 다 **숨어 있어서** 일반 사용자가 발견하지 못한다. 공간(빈틈) 기반 어포던스는 정의상 "빈틈없이
가득 찬" 경우 무효이므로, 해법은 **계층(hierarchy) 기반**이어야 한다.

## 해법 — 선택 브레드크럼 (계층 경로 바)

선택된 프레임의 조상 경로(`상위프레임 › 행 › 아이템`)를 항상 보이는 바로 표시하고, **각 세그먼트를
클릭하면 그 조상을 선택**한다. Figma 패턴.

- 공간이 아니라 트리에 의존 → 꽉 찬 컨테이너에 정확히 들어맞음.
- 이미 존재하는 `Shift+Enter`(부모 선택) 기능을 **눈에 보이게** 만들어 발견성 문제까지 동시 해결.
- 신규 데이터 모델 0: `findTrailDeep` + `selectFrame`(둘 다 기존) 재사용.

## Technical Feasibility — FEASIBLE (자명)

기존 인프라만 조합한다. `findTrailDeep(doc, id)`는 root-직속→타깃(inclusive) Item 체인을 이미
반환하고, `useSelection().selectFrame(id)`는 임의 id를 선택한다. 신규 API·서버·스키마 변경 없음.
순수 도출 함수 + 표현 컴포넌트 한 개. 위험 표면 없음.

## Risk — 낮음 (인라인)

- **데이터/보안:** 없음. 순수 클라이언트 읽기 전용 UI. 문서 변이 없음 → History 계약 무관(읽기만).
- **회귀:** 선택을 *바꾸는* 동작은 기존 `selectFrame` 경로 그대로. 신규 변이 경로 도입 안 함.
- **레이아웃 충돌:** ContextualToolbar(top:60 center)와 겹치지 않도록 브레드크럼은 좌상단 정렬
  (DR-137). 드래그 중 캔버스 라우터 starvation 방지 위해 `useSelectionChromeInteractive` 게이팅
  재사용(WI-200과 동일 패턴).

## Design System Triage — REUSE (3-5단계 미해당)

신규 프리미티브/토큰/테마 없음. `@weave/design-system`의 `Toolbar`/`ToolbarDivider`/`Button`
(ghost) + 토큰(`--surface-1`, `--radius-md`)만 조합. 브레드크럼은 weave 프레임 트리에 특화된
네비게이션 어포던스이므로 **앱 레벨**(`apps/web`)에서 프리미티브를 조합 — 디자인시스템에 도메인
지식을 넣지 않는다. → 디자인-팀 협업 트리거 없음.

## Engineering Plan

1. **순수 도출 모듈** `apps/web/src/document/selection-breadcrumb/breadcrumb-trail.ts`
   - `buildBreadcrumb(doc, selectedId): ReadonlyArray<BreadcrumbSegment>`
   - `findTrailDeep` 사용. trail 길이 < 2면 `[]` 반환(조상 없음 = 네비 가치 없음 → 캐일러가 숨김).
   - 각 세그먼트: `{ id, label, isCurrent }`. 라벨 = `attrs.label/title/heading/caption/summary`
     순, 없으면 kind의 한국어명(`frame→프레임` 등), 최후엔 raw kind. (DR-137 §라벨)
   - root는 제외(합성 wrapper, 비선택 — hit-test 주석·WI-163과 일관).
   - 단위 테스트 `breadcrumb-trail.test.ts` (hit-test.test.ts 픽스처 패턴 차용).
2. **표현 컴포넌트** `apps/web/src/pages/design/view/SelectionBreadcrumbBar.tsx`
   - props: `document`, `selectedId: string | null`, `onSelect: (id) => void`.
   - **비-포털 프레젠테이션 바** — trail≥2일 때만 `Toolbar` 셸 + 세그먼트(토큰 기반 컴팩트
     `<button>`) + `›` 구분자 반환, 아니면 null. 마지막=현재(`aria-current="true"`).
   - 포털·고정배치·visible/interactive 게이트는 호스트(아래 #3)가 소유.
3. **호스트/배선** — DR-137 §1 최종: 별도 좌상단 오버레이가 아니라 `SelectionToolbarOverlay`
   포털 안 **중앙 세로 스택** 최상단 행으로 코로케이션(그 아래 ContextualToolbar). 오버레이에
   `selectedId`/`onSelectFrame` prop 추가, `DesignPage.tsx`가
   `selectedIds.size===1 ? [...][0] : null` + `selectFrame` 전달. 빌드 중 SVL에서 발견한 Aku
   런처(z48) 좌상단 충돌이 이 배치 변경의 근거(DR-137 §1).
   - **Decommission Sweep:** 초안의 `SelectionBreadcrumbOverlay.tsx`(포털 변형)는 삭제됨.

## SVL (Continuous Self-Verification)

- [x] `tsc` 타입체크 통과 (0 errors)
- [x] vitest `breadcrumb-trail.test.ts` green 8/8 (중첩 경로·최상위 빈배열·누락 id·null·root 제외·라벨 폴백)
- [x] e2e `figma-selection-breadcrumb.spec.ts` **3/3 green** (자식선택→바표시 / 조상클릭→부모선택 /
      최상위→바숨김). 초안 좌상단 배치는 Aku 충돌로 1건 실패 → 중앙 코로케이션으로 전환 후 전부 green.
- [x] 회귀 가드: `figma-right-click-layer-picker.spec.ts` 3/3 green(셀렉션 리팩터 무해 확인).
      `multi-toolbar.spec.ts` 4건 실패는 **본 변경과 무관** — `helpers.ts:128`
      `waitForLoadState("networkidle")`가 `addShape` 경로에서 샌드박스 미도달 타임아웃(기준선 이슈,
      메모 [[weave page-bounded editing]] 기록). 브레드크럼/레이어피커 스펙은 `addFrame` 경로라 통과.
- [x] 육안(운영자 확인 완료, 2026-06-13): 중첩 프레임 자식 선택 → 브레드크럼 표시 → 조상 세그먼트
      클릭 → 부모 선택 동작 확인

## 후속 (별도 WI 후보)

- 레이어/아웃라인 패널(영구 트리) — 구조적 정공법이나 별도 과제(상태 소유·대형 문서 성능).
- Cmd 홀드 시 "선택될 프레임" 호버 프리뷰.
- `itemLabel` 단일 소스화 — 현재 hover-describer/layer-picker/breadcrumb 3곳에 라벨 폴백이
  분산. 통합 리팩터는 블라스트 반경 때문에 본 WI에서 분리(DR-137 §라벨에 기록).
