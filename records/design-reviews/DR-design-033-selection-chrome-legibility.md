# DR-design-033 — 선택 chrome 가독성 (descendant hover · resize-handle 최상단 · gap/padding 마감)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-033 |
| Date | 2026-06-14 |
| Owner | hbpark (design-system-agent) |
| Component | `@weave/design-system` primitive `HoverAffordanceLayer` + 토큰(`tokens.css`), primitive `SelectionLayer`(z), app-local `LayoutEditHandles`(gap grip/라인 마감) |
| Triage Decision | **Step 1–2 — Reuse + Extend.** 기존 chrome primitive/토큰을 정제. **공개 design-system primitive(HoverAffordanceLayer) + 공유 토큰을 건드리므로 design-team-collaboration 리뷰에 해당**(SelectionLayer z, tokens.css). 신규 primitive/테마 없음. |
| Refines | DR-design-016(HoverAffordanceLayer 3-tier — descendant 시각), DR-design-031(gap/padding 핸들 — 마감 미완 인정분) |

## Triage Walk

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | 세 문제 모두 **기존** chrome(HoverAffordanceLayer / SelectionLayer / LayoutEditHandles)의 시각 정제. 신규 컴포넌트 0. |
| 2. Extend | ✓ | (a) descendant tier에 **전용 토큰** `--hover-affordance-stroke-descendant` 추가(focal 토큰 재사용 중단). (b) SelectionLayer z 40→43(상수 정제). (c) gap grip elevation/라인 weight 조정. |
| 3. Grow | △ | 토큰 **1개** 추가(`--hover-affordance-stroke-descendant`). 신규 primitive/테마 없음 → design-team-collaboration 리뷰로 기록(본 DR). |
| 4. Escape | ✗ | 캔버스 chrome은 기존 primitive 범주 내. 이탈 불필요. |

## Context — 사용자가 보고한 3가지 (선택된 dense grid/table 프레임)

1. **외곽 가독성:** grid 최외곽에서 셀별 **dashed 윤곽**과 selection의 **solid ring**이 겹쳐 핑크 stroke가 경쟁 → 표 전체가 noisy/illegible.
2. **resize 핸들 최상단:** 사각 resize 핸들이 다른 chrome(gap grip / layout 라인)에 가려질 수 있음 → 항상 위에 있어야 함.
3. **gap/padding 핸들 마감:** flat한 빈 다이아몬드(elevation 없음)라 resize 핸들 마감과 불일치 → 미완성 인상.

## 라이브 캡처로 교정한 진단 (2026-06-14, 추가 검증)

최초 구현 후 사용자 피드백: "호버는 개선됐는데 **선택했을 때는 별로 안 달라졌다**." 임시 e2e 하네스(`_tmp-grid-shot.spec.ts`, 사용 후 삭제)로 auto-grid 프레임을 선택해 `/tmp/grid-selected.png`를 실측한 결과:

- "그리드 최외곽 점선+실선 겹침"의 점선은 **hover affordance(descendant)가 아니라** 선택 시 항상 그려지는 **`LayoutEditHandles`의 PaddingEdge(dashed)** 였다. padding≈0인 표에서는 이 dashed가 **selection ring(solid)** 위에 정확히 겹쳐 프린지로 남아 "잘 안 보임"을 유발.
- 즉 문제 1은 **호버 상태(descendant 약화)** 와 **선택 상태(padding edge ↔ ring)** 두 갈래다. 최초 구현은 호버 갈래만 고쳐 선택 상태 체감이 적었다.
- descendant 약화(아래 §문제 1a)는 호버 상태에서 유효(가운데 셀만 focal로 도드라짐 확인). 선택 상태는 §문제 1b로 추가 해결.

## 결정 + 정확한 값

### 문제 1b — 선택 상태 perimeter 겹침: padding edge를 ring 안쪽에 고정 (LayoutEditHandles)

> 2차 수정(사용자 피드백 "패딩 없을 때도 핸들링 가능해야 함 — 제거하면 못 잡음"): **숨기지 않고**, 각 변의 인셋을 화면 **최소 `MIN_PADDING_EDGE_INSET_PX = 6`px**로 클램프해 그린다.

- ~0 padding 변은 프레임 가장자리(=ring 위)가 아니라 **ring 살짝 안쪽**(6px)에 항상 렌더 → dashed 프린지가 ring과 겹치지 않으면서도 **항상 grabbable**.
- cross-axis 길이도 동일 인셋으로 클램프 → 0 padding에서도 라인이 코너(리사이즈 핸들)에 닿지 않음.
- 드래그 math는 **라이브 커서**를 읽으므로 resting 6px 오프셋은 시각 전용(드래그 시 즉시 커서 추종). 패딩 값은 toolbar(WI-220)가 정확히 표기.
- 드래그/geometry/명령/`data-testid` 무변경. WI-219 e2e 3/3 green.
- 실측: `padding 0` 선택 grid에서 dashed가 ring 위가 아닌 안쪽에 표시·grabbable, `padding 0.02`에선 실제 인셋대로 표시.

### 문제 1a — descendant hover tier 약화 (HoverAffordanceLayer + tokens)

descendant는 **co-equal 타깃이 아니라 secondary guide**다. focal hovered(full accent 2px solid + glow)가 단일 primary 타깃 위계를 유지하도록 descendant를 약화한다.

- 신규 토큰 `--hover-affordance-stroke-descendant: color-mix(in oklch, var(--accent) 55%, transparent);` — focal 대비 낮은 chroma(~55%).
- descendant outline: `2px dashed var(--hover-affordance-stroke-hovered)` → **`1px dashed var(--hover-affordance-stroke-descendant)`**.
- `outlineOffset: 0px` → **`-1px`** — 셀 윤곽을 안쪽으로 tuck. 컨테이너 edge에 flush한 셀이 selection ring(solid)과 더 이상 겹치지 않음(perimeter clash 해소).
- focal hovered tier(2px solid + 4px glow), parent tier는 **무변경**.

근거: 클래시의 원인은 descendant가 focal 토큰(full chroma)을 재사용 + 2px + offset 0이라 perimeter 셀 dashed가 ring 위에 정확히 얹히던 것. 토큰 분리 + 약화 + 안쪽 tuck로 위계 복원.

### 문제 2 — resize 핸들 최상단 (SelectionLayer z)

- SelectionLayer 포털 `zIndex: 40` → **`43`**. selection ring + 사각 resize/rotate 핸들이 포털 z를 상속하므로 핸들이 **non-menu chrome 중 최상단**.
- 새 위계(오름차순): HoverAffordance 35 · chart guide 39 · LayoutLine/padding 40 · corner-radius grip 40 · GapGrip 41 · Marquee 42 · **SelectionLayer(ring+resize 핸들) 43** · RubberBand 45 · SelectionToolbar 46 · Aku 48 · menu 50 · tooltip 60.
- 43은 GapGrip(41)/Marquee(42) **위**, SelectionToolbar(46)·Aku(48)·menu(50)·tooltip(60) **아래**. 메뉴/툴바/Aku는 여전히 모든 chrome 위에 그려짐.
- gap grip/라인은 40–41 유지(드래그 타깃 위계 보존).

### 문제 3 — gap/padding 핸들 마감 + 겹침/속빔 (LayoutEditHandles)

> 2차 수정(사용자 피드백): 다이아몬드 (a) 열/행 grip이 교차-중심에서 정확히 겹쳐 구분·선택 불가, (b) 속이 비어(`--surface-1` 반투명) 뒤 라인이 비쳐 hollow.

- **겹침 해소 — disjoint 레인:** 열 gap grip은 **상단 레인**(cy = innerTop + min(`GRIP_LANE_PX=18`, innerH/2)), 행 gap grip은 **좌측 레인**(cx = innerLeft + min(18, innerW/2)). 두 축이 서로 다른 레인에 있어 대칭 grid(2×2 등)에서도 같은 점에 절대 스택되지 않음 → 각각 독립적으로 보이고 클릭됨. 드래그는 boundary 좌표(축별 cx/cy)를 쓰므로 cross 위치 변경은 드래그에 영향 없음(검증: gap grip e2e green).
- **속빔 해소 — 불투명 채움:** background `var(--surface-1)`(반투명 glass) → **`#ffffff`**(resize 핸들과 동일한 불투명 흰색). 라인이 더 이상 grip을 가로질러 비치지 않음. **같은 글래스 채움을 쓰던 모서리 곡률 핸들(`corner-radius-handle.tsx`)도 `#ffffff` 불투명으로 통일**(사용자 후속 요청) — 프레임 edge/곡률 호가 비치던 hollow 해소.
- **GapGrip 마감:** `box-shadow 0 1px 4px rgba(0,0,0,0.22)`(resize 핸들 `0 1px 3px rgba(0,0,0,0.18)`와 parity) + `borderRadius: 2`(tip softening) 유지. border `--accent` 유지.
- **LayoutLine(gap/track 라인):** `opacity: 0.55` → **`0.42`** — 라인은 secondary guide로 물러나고 elevated grip이 primary 타깃으로 도드라짐.
- **PaddingEdge(dashed):** `opacity: 0.7` → **`0.6`** — track 라인 guide weight와 일치.
- 색은 전부 토큰(`--accent`, `--surface-1`) — 기존 fallback hex 외 신규 하드코딩 없음.
- **드래그 math/geometry/command wiring/data-attr 전부 무변경** — 시각만.

## 접근성

- HoverAffordanceLayer는 `aria-hidden`(시각 전용) — descendant 약화는 a11y 영향 없음.
- GapGrip/PaddingEdge는 `aria-label` 유지("열 간격 조절" 등), `data-handle-*`/`data-testid` 무변경 → 키보드/테스트 영향 없음.
- z 변경은 페인트 순서만 — focus order/tab 영향 없음.
- reduced-motion: 핸들은 즉시 추종, 트랜지션 없음 → 추가 처리 불필요.

## What changed (파일 + 값)

| 파일 | 변경 |
|---|---|
| `packages/design-system/src/tokens.css` | 신규 토큰 `--hover-affordance-stroke-descendant: color-mix(... 55% ...)` + 주석 블록 갱신 |
| `packages/design-system/src/components/HoverAffordanceLayer.tsx` | descendant outline `2px dashed (hovered token)`→`1px dashed (descendant token)`, `outlineOffset 0px`→`-1px`; LAYER_STYLE z-주석(SelectionLayer 43) 갱신 |
| `packages/design-system/src/components/SelectionLayer.tsx` | 포털 `zIndex 40`→`43` + 주석 |
| `apps/web/src/document/selection-chrome/corner-radius-handle.tsx` | **(문제 3)** grip background `var(--surface-1)`→`#ffffff`(불투명 채움 통일) |
| `apps/web/src/document/selection-chrome/LayoutEditHandles.tsx` | **(문제 1b)** `MIN_PADDING_EDGE_INSET_PX = 6` — paddingEdges 위치·cross 길이를 최소 인셋으로 클램프(ring 안쪽 고정, 0 padding에서도 grabbable); **(문제 3)** `GRIP_LANE_PX = 18` — gridGapGrips 열=상단/행=좌측 disjoint 레인(겹침 해소); GapGrip background `--surface-1`→`#ffffff`(불투명 채움) + `boxShadow 0 1px 4px rgba(0,0,0,0.22)` + `borderRadius 2`; LayoutLine `opacity 0.55`→`0.42`; PaddingEdge `opacity 0.7`→`0.6`; z-주석 갱신 |

## 검증

- `cd apps/web && npx tsc --noEmit` — PASS. `packages/design-system` tsc — PASS.
- 단위 테스트 전체 1381 green(변경 값 단언 테스트 없음 → 갱신 불요).
- **라이브 캡처(Continuous Self-Verification)**: 선택된 auto-grid를 임시 playwright 스펙으로 띄워 실측(사용 후 삭제).
  - 1차: `padding 0` → dashed가 ring 위 겹침, `padding 0.02` → edge 정상, 호버 시 descendant 약화·focal 셀만 도드라짐.
  - 2차(문제 1b/3 재수정 후): **2×2** grid → 열/행 다이아몬드가 상단·좌측 레인으로 분리(겹침 해소), **4×3** grid → 열 grip 3개 상단 레인·행 grip 2개 좌측 레인·불투명 흰색 채움(라인 비침 없음)·padding 0에서도 dashed edge가 ring 안쪽에 grabbable로 복원.
- WI-219 e2e(`padding-grid-gap.spec.ts`) 3/3 green(padding 변 드래그·gap grip 드래그·track 라인 회귀 무).
