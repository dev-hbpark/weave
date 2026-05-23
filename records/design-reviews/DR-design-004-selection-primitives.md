# Design Review — DR-design-004

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-004 |
| Title | `SelectionLayer` + `SelectionHandle` design-system primitives — selection ring + handle dispatch by capability |
| Triggering Work Item | WI-011 |
| Triage outcome | **Grew (primitives)** — step 3 of design-system-triage decision tree |
| Status | **Accepted** (single-owner, agent-reviewed, hbpark sign-off 2026-05-22) |
| Owner | hbpark |
| Reviewer(s) | `design-system-agent` (auto), `frontend-design-pattern-agent` (auto), hbpark |
| Date | 2026-05-22 |

## 1. Change in one sentence

`@weave/design-system` 의 새 primitives — `SelectionLayer` (target 의 bounding box 위 의 overlay, capability 의 move/resize/rotate 의 boolean 의 따른 handle visibility), `SelectionHandle` (corner + edge + rotation 의 dot, 8 directions + 1 rotation).

## 2. Why

WI-011 의 capability dispatch 의 시각 — selection ring + 8 corner/edge handles + rotation handle. design-system 안 박제 의무 — 미래 도메인 의 swap 자연.

## 3. Visual evidence

- **SelectionLayer**: target 의 bounding box 위 의 transparent overlay. 1px outline (`var(--accent)`) + 8 handles + 1 rotation handle. capability 의 따라 visible.
- **SelectionHandle**: 8px×8px 의 작은 square (corner) 또는 6px×16px (edge). focus-visible ring. cursor 의 의도 (`nwse-resize`, `ns-resize`, `ew-resize`).
- **Rotation handle**: top-center 위 12px (위 의 short stem + circular dot). cursor `crosshair`.
- **Multi-selection ring**: combined bbox 의 outline. handles 안 visible (Step 5 의 group resize 의 의도).

## 4. Scope of the change

- [x] New primitives — `SelectionLayer`, `SelectionHandle` (2).
- [ ] Token 추가 — `--selection-ring` (default `var(--accent)`), `--selection-handle-bg` (default `var(--bg-page)`), `--selection-handle-border` (default `var(--accent)`). 3 새 semantic tokens 추가 의무. **DR-design-004 의 part — 미디어 의 의도된 hot-pink accent 의 의도된 swap 의 의무**.
- [ ] New theme variant — N/A.

## 5. Consistency check

- [x] WCAG AA contrast — handle 의 outline 의 의도된 ≥ 3:1 의 의무. 현재 accent token 의 의무.
- [x] Motion respects `prefers-reduced-motion` — handle 의 hover/active 의 의도된 scale transition 의 reduce 시 OFF.
- [x] Focus-visible — handle 의 keyboard accessible (Tab 의 navigation, arrow keys 의 의도된 nudge 의 의무 — 별 라운드).
- [x] Component reads tokens — 새 3 token 의 박제 의무.
- [x] Variant ceiling — handle 의 variant 0 (corner/edge/rotation 의 type prop). 안전.

## 6. Brand alignment

Aurora 의 의 selection ring 의 의도 = 의 의 의도된 magenta + cyan accent. Mono 의 의 sharp single orange. Vivid 의 의 hot-pink. 도메인 accent 의 통합 — capability dispatch 의 의도된 시각 분리 (canvas-shape 의 의도된 magenta 의 의무 등).

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | ✅ | 2 primitives + 3 token 의 ceiling 안전. variant 0. |
| `frontend-design-pattern-agent` | ✅ | selection ring + 8 handles + rotation 의 의 의 패턴 = Figma / Photoshop / Affinity 의 표준. |
| `frontend-architecture-agent` | ⚠️ | pointer drag 의 의 INP 의 의무 박제 — drag 의 의 의 의 high-frequency event 의 의 RAF batching 의 의무 (Step 1 의 의 직접 사용 OK, Step 2 의 perf 측정 의 의무). |
| `frontend-performance-agent` | ⚠️ | resize / rotate 의 의 transform 의 의 의 (RGBA opacity) — center-based transform-origin 의 의무. ✅ stable bounding box (R-17 의 의 의 의 의 OK). |

## 8. Human sign-off

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner | 2026-05-22 | single-owner. perf 의 의 의 의무 박제 (RAF batch 의 의 Step 2). |

## 9. Decision

- [x] **Accepted** — proceed to Build (WI-011 Step 1).

## 10. Follow-ups

- [ ] `packages/design-system/README.md` 의 primitive list 갱신 (이번 build 동행).
- [ ] Step 2 의 의 RAF batching 의 의무 측정.
- [ ] Step 5 의 group selection 의 visual ring 의 의무 (combined bbox).
- [ ] Keyboard 의 nudge (arrow keys) 의 의 의무 — accessibility 의 의무 (Step 4+).

## Links

- WI-011 / DR-010 (manipulation capability registry)
- DR-007 / DR-design-001 / DR-design-002 / DR-design-003
- `features/editing/UX_DESIGN.md`
