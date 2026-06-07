# DR-092 — px/% 단위 토글 깜빡임 수정 (DR-082 가드를 선언적 경로로 한정)

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: DR-082(px↔ratio value>1 가드), DR-091(에이전트 폰트 그라운딩)
- 트리거: "contextual 메뉴에서 ratio(%)로 토글한 직후 슬라이더를 드래그하면 숫자가 px↔% 번갈아 보임"

## 근본 원인

`commands.ts`의 `normalizeTextAttrs`가 `sanitizeFontSizeSpec`(DR-082: `{kind:'ratio', value>1}` → `{kind:'px'}`)를 **UI `patch` 경로(`provided === undefined`)에서도 무조건** 실행했다(이전 line 511, `provided === undefined` early-return 위).

툴바의 px/% 토글·슬라이더는 `patch` 함수 폼으로 가며 부모 높이로 ratio를 **명시적으로** 계산한다. **작은 중첩 부모에서는 `curPx / parentHeightPx > 1`** 이 정당하다(폰트가 작은 부모 프레임보다 큼). 그런데 sanitize가 이 >1 ratio를 px로 되돌려 → 토글한 "%"가 즉시 px로 snap-back → 드래그 중 단위가 px↔% 진동.

주석의 전제 *"the toolbar never emits a >1 ratio"* 가 틀렸다 — 작은 부모에선 정당한 >1 ratio가 나온다.

## 결정

`sanitizeFontSizeSpec`를 **선언적(에이전트) 경로에만** 적용. `normalizeTextAttrs`에서 `if (provided === undefined) return after;`를 sanitize **앞으로** 이동 → UI `patch` 경로는 가드를 건너뛰고 사용자가 고른 ratio(>1 포함)를 신뢰.

DR-082 가드는 본래 에이전트의 px-오태깅용이고, 에이전트 경로(`attrs`/`attrsOverride`, `provided` 정의됨)에는 그대로 유지(`weave.item.add` 692, `weave.items.update` 1380, 선언적 `item.update`). DR-091 그라운딩이 보통 px→ratio(≤1)로 먼저 변환하므로 sanitize는 fallback.

## 영향 / 검증

- UI px/% 토글이 작은 부모에서도 ratio를 보존(깜빡임 해소).
- 기존 DR-082 테스트(전부 선언적 `attrs`/`attrsOverride`)는 무영향 — sanitize 계속 작동.
- 신규 테스트: `commands.test.ts` "update: the UI `patch` form PRESERVES a >1 ratio" (1.2 ratio가 px로 재태깅되지 않음).
- 765 단위 테스트 통과, typecheck·빌드·Biome 클린.

## 비고

`fontSize`(레거시 px 미러)와 `fontSizeSpec`(권위)의 이중 표현은 여전히 드리프트 위험원. 장기적으로 단일화/동기화하면 에이전트 사이징(DR-091)과 이 토글 깜빡임을 함께 줄인다.
