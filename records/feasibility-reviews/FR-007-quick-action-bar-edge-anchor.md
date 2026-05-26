# FR-007 — QuickActionBar edge anchor + hover grace (FEASIBLE)

## Metadata

| Field | Value |
|---|---|
| ID | FR-007 |
| WI | WI-036 |
| Date | 2026-05-26 |
| Owner | hbpark |
| Verdict | **FEASIBLE** |

## Question

QuickActionBar 의 hover leave 시 사라지는 문제를 frame edge anchor + hover target union + grace period 의 3 결합으로 해결할 수 있는가? 현재 state of the art 와 의 conflict 가 있는가?

## State of the art

- **Figma**: frame hover 시 top edge 의 안쪽에 selection chrome + 상단에 floating action bar. Bar 와 frame 의 visual gap 0. Hover 의 target 이 frame ∪ bar 의 union.
- **Notion**: block hover 시 좌측에 + handle (sticky). hover gap 의 robustness 위해 hover target 이 block ∪ handle wrap.
- **Linear / Tana**: hover-driven action bar — 거의 모든 production 식 floating chrome 이 hover gap 의 grace period (200-300ms) 박제.

3 패턴 모두 W3C / WHATWG / Baseline 영향 없음 — pure DOM mount 위치 + React state 의 setTimeout 조합.

## 의존 분석

| 기술 | 평가 |
|---|---|
| Absolute positioning (frame 의 child 로 bar mount) | Browser baseline 1996+. |
| `data-*` attribute lookup (`Element.closest`) | Baseline. |
| `setTimeout` / `clearTimeout` 의 grace | Baseline. |
| `pointer-events: auto/none` 의 hover transparent | Baseline. |
| React `useEffect` + ref-based timer | 표준. |

## Trade-off

| Trade-off | 평가 |
|---|---|
| Mount 위치 변경 (fixed → per-frame absolute) | bar 가 frame 의 transform (scale, rotate) 를 따라감 — 의도 일치. transform 의 영향으로 bar 의 size 가 변할 수 있음 → `transform: scale(...)` 적용된 NestedFrame 에서 bar 를 inverse-scale 처리 의무 (counter-scale wrap). |
| Multiple selected items 시 multiple bars | hovered frame 만 visible — useHoverContext 의 single source. |
| 200ms grace 의 hover-slow 적응 | Figma 와 같은 200ms — 대다수 사용자 OK. 사용자별 다를 수 있어 telemetry hook 의 v1.x 박제. |
| frame edge 의 visual 침범 | top-left 만 v1; 의 visual 충돌 가능. v1.x 의 auto-flip (frame 의 가용 공간 기반). |

## Verdict

**FEASIBLE** — Baseline 기술만 사용, 3rd-party 의존 0, design-system 의 QuickActionBar primitive 의 host wrap 확장만 필요. UX 재설계의 root cause 가 명확하고 fix 의 3 결합 (A/B/C) 가 정통.

## Conditions for build

- DR-design-012 의 QuickActionBar primitive 의 `[data-quick-actions-bar]` attribute 박제 + host wrap (anchor variant) 가 design-system review 통과해야.
- Engineering Plan 의 transform inverse-scale 의 구체 (counter-scale wrap 또는 absolute-positioned outside transform).

## Links

- WI-036 — 의 build 의무.
- WI-027 — QuickActionBar primitive 의 도입.
- WI-035 P2 — 의 사용자 보고 root cause.
