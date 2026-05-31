# Decision Record — DR-022 텍스트 아이템 대각선(코너) 리사이즈 = 박스 높이 비율로 폰트 스케일 (DR-016 코너 조항 supersede)

## Metadata

| Field | Value |
|---|---|
| ID | DR-022 |
| Title | 텍스트 아이템의 코너(대각선) 핸들 드래그는 박스 크기뿐 아니라 fontSize 도 **박스 높이 비율 (nh / 원래 height)** 로 비례 스케일한다. px / % (`fontSizeSpec` ratio) 단위 모두 무손실 변환. 엣지(e/w/n/s) 드래그는 박스 크기만 변경 (불변). |
| Decision Level | **1 Local** — weave 내부 텍스트 resize UX 결정. agocraft schema 영향 없음 (기존 `fontSize` + `fontSizeSpec` 필드 그대로 사용). |
| Owner | hbpark |
| Required approvers | hbpark (responsible / accountable) |
| Consulted | 사용자 (2026-05-31 명시 요청 + AskUserQuestion 으로 스케일 기준 = "자유 리사이즈 + 높이 기준" 확정) |
| Informed | `design-system-agent` (PropertiesPanel fontSize 슬라이더는 그대로 유지 — 코너 스케일과 공존) |
| Status | **Accepted** |
| Decided on | 2026-05-31 |
| Supersedes | **DR-016 의 코너 조항만** (Decision #2·#3 — "코너 = 박스만, fontSize 불변"). DR-016 의 나머지 (3-mode enum, 모드별 핸들 노출, fontSize 슬라이더 유지) 는 전부 유효. |

## Context

DR-016 (2026-05-25) 은 텍스트 resize 를 Figma 100% paradigm 으로 박제하면서 **코너 드래그 = 박스만 변경, fontSize 불변** 으로 정했고, Phase 18 의 Genially-식 corner-fontSize-scale 을 폐기했다 (`computeResize` 의 fontSize 계산 제거).

사용자가 2026-05-31 그 결정의 코너 조항을 **명시적으로 뒤집기를 요청**: "텍스트아이템의 대각선 리사이즈는 텍스트 폰트의 크기도 비율에 맞게 변경되어야해 px,% 모두 적절하게 변환하도록해줘."

`__origFontSize` → `computeResize` → `__newFontSize` → `commitFrame` (frame + fontSize 단일 패치 dispatch) 의 사이드채널 파이프라인은 DR-016 이후에도 **인프라가 그대로 남아있어** (계산만 제거됨), 재활성화 비용이 낮다.

## Options considered

스케일 기준 (AskUserQuestion 2026-05-31):

| Option | 설명 | 선택 |
|---|---|---|
| 비율 고정 + 균일 스케일 | 코너 드래그 시 aspect ratio 잠금, 박스·폰트 동일 배율 | ✗ |
| 자유 리사이즈 + 기하평균 | 폭/높이 독립 변경, 폰트 = `sqrt((nw/ow)*(nh/oh))` | ✗ |
| **자유 리사이즈 + 높이 기준** | 폭/높이 독립 변경, 폰트 = `nh / 원래 height` | **✅ 선택** |

## Decision

1. **코너(2글자 dir: ne/nw/se/sw) 드래그** → 박스는 기존대로 자유 변형, **fontSize 는 박스 높이 배율 `scaleFactor = nh / origHeight` 로 비례 스케일**.
2. **엣지(1글자 dir: e/w/n/s) 드래그** → 박스 크기만 변경, fontSize 불변 (기존 동작 유지, min-width 클램프도 유지).
3. **단위 변환** — `scaleFactor` 는 단위 무관:
   - legacy `fontSize` (px) → `origFontSize × scaleFactor`.
   - `fontSizeSpec { kind:"px", value }` → `value × scaleFactor`.
   - `fontSizeSpec { kind:"ratio", value }` → `value × scaleFactor` (ratio 는 변하지 않는 부모 높이의 분수라 같은 배율로 곱하면 렌더 px 도 동일 배율로 스케일됨).
   - 두 필드를 `commitFrame` 에서 frame 과 함께 **단일 `weave.item.update` 패치** 로 dispatch (Phase 15 split-loses-first 주석 참조).
4. **fontSize 슬라이더 유지** — PropertiesPanel 의 명시적 입력은 코너 스케일과 공존 (DR-016 의 슬라이더 결정은 유효).

구현: `apps/web/src/pages/FrameStage.tsx` — `frameAccess.readFrame` (`__origFontSizeSpec` 추가), `computeResize` (코너 분기 + `__newFontSize`/`__newFontSizeSpec` 계산), `commitFrame` (`fontSizeSpec` 같이 dispatch), 핸들 게이팅 주석 갱신.

## Why this option

1. **사용자 명시 결정** (2026-05-31) — 두 번에 걸친 확정 (요청 + 스케일 기준 선택).
2. **높이 기준 = 폰트의 본질** — fontSize 는 세로 측정값(em/cap height)이라 박스 높이와 직접 대응. 폭만 늘릴 때(줄당 글자 수 조정) 폰트가 안 변하는 게 직관적. 높이를 키울 때만 글자가 커짐.
3. **단위 무손실** — 같은 배율을 spec value 에 곱하는 단일 규칙으로 px/ratio 둘 다 자연스럽게 변환, 별도 부모 높이 resolve 불필요.
4. **인프라 재활용** — 사이드채널이 이미 존재해 추가 표면 없이 계산만 복원.

## Consequences

- **DR-016 회귀 e2e reverse**: `apps/web/e2e/text-item.spec.ts` 의 "DR-016 regression — corner-resize keeps fontSize unchanged" → "DR-022 — corner-resize scales fontSize by box height ratio (px spec)" 로 재작성 + ratio 변환 spec 1개 신규. 둘 다 PASS.
- **"edge-resize does NOT change fontSize"** (line 563) 그대로 PASS — 코너 한정 스케일 검증.
- **typecheck PASS**, `text-item.spec.ts` 21/21 PASS (chromium).
- **사용자 학습 곡선**: DR-016 직후 적응했던 사용자는 다시 코너=글자 스케일로 전환. media/shape 의 코너=비례 스케일과 일관성↑ (DR-016 §Consequences 가 지적한 비일관 해소).
- **Review-by 2026-09-30** — DR-016 과 함께 v1 launch 후 사용성 회고에서 재평가.

## Dissent

없음. 사용자 명시 confirm.

## Links

- Supersedes (코너 조항만): [DR-016](DR-016-text-resize-paradigm.md)
- Related: DR-014 (ContextualToolbar / fontSize 슬라이더 mount), DR-015 (rich text — 글자별 fontSize 와의 관계는 v1 에서 박스 단위 스케일만)
- Product spec: `docs/product/TEXT_ITEM_SPEC.md` §1
- Code: `apps/web/src/pages/FrameStage.tsx` (`frameAccess` — readFrame / computeResize / commitFrame)
- Tests: `apps/web/e2e/text-item.spec.ts` (DR-022 2 spec)
