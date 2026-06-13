# DR-137 — 선택 브레드크럼: 좌상단 배치 · trail≥2 게이트 · 라벨 폴백 체인

- **Status:** ACCEPTED · 2026-06-13
- **WI:** WI-214
- **Relates:** WI-033(레이어 피커·drillUp), WI-200/DR-129(셀렉션 크롬 visible vs interactive),
  WI-163(페이지 deep-only)

## 컨텍스트

꽉 찬 중첩 프레임 선택 문제(WI-214)의 해법으로 계층 브레드크럼을 도입한다. 세 가지 설계 선택을
고정한다: (1) 화면 배치, (2) 표시 게이트, (3) 라벨 도출.

## 결정 1 — 배치: 셀렉션 크롬 중앙 스택의 최상단 행 (ContextualToolbar 위)

브레드크럼을 `SelectionToolbarOverlay` 포털 안의 **중앙 세로 스택**(`flex-col items-center gap-2`)
최상단 행으로 렌더하고, 그 아래에 기존 ContextualToolbar를 둔다. 둘은 하나의 포털·하나의
visible/interactive 게이트·하나의 pointer-events 정책을 공유한다.

- **택(최종):** 중앙 코로케이션. ContextualToolbar(`top:60, left:50%`)와 같은 컨테이너에서 세로로
  쌓이므로 절대 겹치지 않고, 둘 중 하나가 null이어도 자연스럽게 한 줄만 보인다.
- **기각 — 좌상단 별도 고정 바(초안 `top:60; left:16`):** SVL e2e에서 **로밍하는 "아쿠(Aku)"
  런처 버튼(`[data-aku-launcher]`, z-48, 86×120px, 1100ms transition으로 화면을 떠다님)이
  z-48 > 브레드크럼 z-46이라 좌상단 영역을 가려 세그먼트 클릭을 가로채는** 것을 실증
  (`subtree intercepts pointer events`). Aku는 모서리를 배회하므로 좌상단 바는 상시 충돌 위험.
  중앙-상단은 Aku가 머물지 않는 영역(기존 중앙 ContextualToolbar가 안정적으로 클릭되는 것이 근거).
- **기각 — 프레임 앵커 라벨 탭:** 깊이 중첩·꽉 찬 경우 자식/이웃에 가려지고 좌표 추적 비용이 큼.
- **드래그 안전:** 스택 컨테이너가 `useSelectionChromeInteractive` false 시 `pointerEvents:none`
  (WI-200). 브레드크럼이 이 정책을 그대로 상속하므로 캔버스 GestureRouter starvation 무재현.

## 결정 2 — 게이트: 단일 선택 && trail 길이 ≥ 2 일 때만 표시

- 다중 선택(marquee) → 단일 경로 개념이 성립 안 함 → 숨김.
- `findTrailDeep`는 root 제외 [topLevel … target] 반환. 최상위 프레임은 trail 길이 1(자기 자신
  뿐, 조상 없음) → 네비게이션 가치 0 → 숨김. **trail≥2(= 중첩됨)일 때만** 표시.
- 이로써 브레드크럼은 정확히 "중첩 프레임" 상황에서만 등장 — WI-214가 겨냥한 케이스와 일치하고
  비-중첩 상황에서 화면을 어지럽히지 않는다.
- root는 세그먼트에서 제외(합성 wrapper, 비선택 — hit-test.ts 주석/WI-163 deep-only와 일관).

## 결정 3 — 라벨 폴백 체인

세그먼트 라벨 = `attrs.label` → `attrs.title` → `attrs.heading` → `attrs.caption` →
`attrs.summary` → kind의 한국어명 → raw kind.

- `layer-picker`는 `attrs.label ?? "Frame"`만, `hover-describer.itemLabel`은
  `title/caption/heading/summary/kind`만 본다. 브레드크럼은 둘을 합친 가장 풍부한 체인 사용
  (프레임은 `label`, 텍스트/이미지 등은 `title` 등을 가짐).
- kind 한국어명 소형 맵(frame→프레임, text→텍스트, image→이미지, video→비디오, shape→도형,
  line→선, chart→차트, group→그룹) + 미등록 kind는 raw 문자열.
- **부채 인정:** 라벨 폴백이 이제 3곳(hover-describer/layer-picker/breadcrumb)에 분산. 단일
  `itemLabel` 소스화는 기존 테스트 표면(특히 hover-describer)을 건드리는 블라스트 반경 때문에 본
  변경에서 분리하고 WI-214 후속으로 남긴다. Rule(단일 소스) 위반을 의식적으로 유예 — 통합 시
  세 호출처가 같은 폴백을 쓰도록 수렴시킬 것.

## 트레이드오프

- (+) 발견성·선택가능성을 한 번에 해결, 기존 인프라 100% 재사용, 신규 변이 경로 0.
- (+) 코로케이션으로 별도 포털/z-튜닝/Aku 충돌 회피 불필요 — 셀렉션 크롬 정책 단일화.
- (−) 라벨 폴백 일시 3중화(위 인정). 중앙 스택이 길어지면(브레드크럼+툴바) 캔버스 상단을 더 차지하나
  셀렉션 있을 때만·trail≥2일 때만 등장하므로 노출 최소.

## Verification

- 단위: `breadcrumb-trail.test.ts` — 중첩 경로 순서, 최상위(빈 배열), 누락 id, 라벨 폴백, root 제외.
- e2e: `figma-selection-breadcrumb.spec.ts` — 자식 선택→바 표시→조상 클릭→부모 선택.

## Links

- WI-214, hit-test.ts(findFramesAtPoint), selection-context.ts(parentOf/selectFrame),
  SelectionToolbarOverlay.tsx, editor-hotkeys.ts(drillUp).
