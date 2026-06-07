# WI-132 — 그리드/플렉스 미구현 CSS 기능 전부 구현 + 실브라우저 대조

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | agocraft DR-047 (FR-009 T1–T4 deferral 해제) |
| Relates | WI-131(stretch clamp) · `@agocraft/core` 1.0.0-rc.20260607010000 · `@agocraft/layout` 1.0.0-rc.20260607020000 · e2e `layout-css-parity-extensions.spec.ts` |

## Problem (operator, 2026-06-07)

레이아웃 엔진이 CSS flex/grid 의 **부분집합**(FR-009 으로 동결)이라, wrap / baseline /
space-evenly / minmax / repeat(auto-fill·fit) / dense / grid-template-areas 가 미구현.
"미구현 내용은 구현해서 채워줘" → 전부 구현하고 실브라우저로 대조.

## Change (agocraft, DR-047)

`@agocraft/core` 타입/기본값/closed-list 확장 + `@agocraft/layout` 어댑터/트랙사이징:

- **flex**: `space-evenly`(justify), `baseline`(align→start, 텍스트 메트릭 없음),
  `wrap` 다중 라인 + `align-content`(7종).
- **grid**: `minmax()`(CSS fr resolution — min 은 fr share 의 floor), `repeat(auto-fill|auto-fit)`,
  `dense`/`autoFlow`(sparse 커서 기본 + dense backfill), `grid-template-areas`(이름 영역 배치).
- 모든 신규 spec 필드 optional + CSS 기본값 → 구버전 문서 round-trip 무손상, 구엔진 graceful degrade.

재패키징: core/layout 새 버전 → weave 6곳 override + `pnpm install`.

## Acceptance

- [x] agocraft `packages/layout` 유닛 **251 pass** (신규 `css-extensions.test.ts` 11 + 회귀)
- [x] weave 라이브 차등 하니스 `layout-css-parity-extensions.spec.ts` **8/8** — 실브라우저 CSS 대조:
      space-evenly, baseline(=start), wrap×align-content(7), minmax, auto-fill, auto-fit, areas, dense
- [x] 기존 base parity `layout-css-parity.spec.ts` **120/120 flex + 224/224 grid** 유지
- [x] 기존 레이아웃 e2e (child-props, relayout, grid-stretch) 회귀 없음
- [x] 활성 링크: core 20260607010000(FLEX_WRAP/space-evenly), layout 20260607020000(minmax floor fix) 확인

## 알려진 의도적 차이 (DR-047)

- baseline → start (텍스트 메트릭 부재; 동일높이 박스에선 CSS baseline 과 동일)
- `auto` 트랙 = 균등분배(1fr) 단순화 (max-content 미측정)
- auto-fit 빈 트랙 collapse 미모델 (ratio repeat 에선 배치 위치 동일)
