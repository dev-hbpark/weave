# WI-062 — Line as a distinct item kind (`line`)

## Problem

사용자: "도형과 선은 완전 다른 타입이야. 선은 스트로크 속성만 존재해야 하고, 양끝에 화살표나 동그라미 같은 걸 설정할 수 있어야 해." 현재 선(직선/자유선/곡선/자유곡선)은 `shape` 의 `poly` sub-kind 로 모델링되어 도형과 같은 속성 패널(fill 포함)을 공유한다.

## Decision (user directives)

- 2026-05-31 (AskUserQuestion): **완전히 새 item kind `line`** 채택 (UI-레벨 분리가 아니라 agocraft top-level kind 신설). 트레이드오프(주 단위·고리스크) 인지 후 선택.
- 선 = 스트로크 전용(필요 시 점/곡선) + 양끝 endpoint marker(none/triangle/open/diamond/circle). fill 없음.
- 박제: **FR-013**(타당성), **DR-025**(결정), `features/line-item/ENGINEERING_PLAN.md`(단계), agocraft **HANDOFF-020**(크로스프로젝트 스키마/렌더/커맨드).

## Status

- **Planning done** (2026-05-31) — FR-013 / DR-025 / ENGINEERING_PLAN / HANDOFF-020 작성.
- **Phase 1a done** (agocraft schema/geometry, additive) — `LINE_KIND` / `LineAttrs` / `defaultLineAttrs` / `lineToSvgGeometry`(poly 헬퍼 + 공유 arrow-marker 빌더, strokeOnly) 추가 + index export. agocraft `tsc` + builtin-kinds 52 tests green (arrow 리팩토링 회귀 0). weave 무소비 → 재벤더 불필요.
- **Phase 1b done** — serializer 는 `onUnknown:"preserve"` generic → 새 kind attrs 자동 round-trip(변경 불필요). 데이터 마이그레이션은 unknown-kind 보존 덕에 Phase 5 로 안전하게 연기. **core-only repack + pnpm install** 완료(weave node_modules 에 LINE 심볼 반영).
- **Phase 2 done** — weave `DomainKind += "line"`, `ItemAttrsByKind.line`, `DOMAIN_REGISTRY.line`, `LineBlock`(stroke-only + 마커; ShapeBlock 의 `ArrowMarker`/`renderGeometryElement` 재사용·export), `DOMAIN_RENDERERS.line`, `allowedChildKinds += "line"`, seed 기본값. weave `tsc` green.
- **Phase 3 done** — poly-vertex 핸들러를 점-쓰기 경로 parameterize(`composeAttrs`)해 shape/line 공유. line VM 등록(itemKind "line", `attrs.points`). line kind 는 resize/rotate VM 미등록 → 정점/끝점 핸들 + outline 만. `isDomainItem`/zorder 에 "line" 추가(렌더 차단 해소).
- **Phase 4 done** — `LineSection`(StrokeControl + 시작/끝 마커 Select[none/triangle/open/diamond/circle] + Opacity, **fill 없음**) `register("line", …)`. 툴바가 선 선택 시 LineSection 라우팅(data-kind="line"). 마커 = `attrs.heads`, SVG marker 렌더.
- **Phase 5 done** — add-menu "선"(직선/자유선/곡선/자유곡선) 이 `line` kind 생성(toolbar + frame 메뉴, `addNewItem("line", …)` / `insert("line", {lineAttrs})`). `LINE_*` seed consts.
- **검증**: agocraft `tsc`+52 tests, weave `tsc`. e2e 28 pass(add-menu/line-selection/line-endpoint/shape-smooth/shape-poly/figma-quickaction). 스크린샷: 직선이 끝점 삼각형 마커로 렌더, 패널 stroke-only.
- **사용자 요구 3종 충족**: ① 도형↔선 별 kind ② 선=스트로크 속성만(LineSection) ③ 양끝 마커 설정.
- **Phase 6 done** — `migrate-shape-to-line.ts`(`migrateShapeLinesToLineKind`): open poly(자유선/곡선)·`line`·`arrow` shape → `line` kind 변환(points→attrs.points, heads, smooth 보존; id 보존; solid fill→stroke 유닛으로 색 보존; 닫힌 poly/도형은 shape 유지; idempotent). `storage.ts` 의 5개 로드 지점에서 `migrateLegacyKindsToFrame` 다음에 호출. 단위 테스트 7개(`migrate-shape-to-line.test.ts`) green.
- **상태**: **WI-062 완료** — Phase 1~6 전부 구현·검증. agocraft `tsc`+52, weave `tsc`, migration 7 unit + e2e(add-menu/line-selection/line-endpoint/shape-smooth/shape-poly/figma-quickaction) green.
- **잔여 항목 done** — ① agent: `ITEM_KIND` enum 에 "line" + `weave-capabilities.ts` 에 line 설명(stroke-only, points/smooth/heads, decoration.stroke) 추가 → Aku 가 선 생성·편집 가능. ② hover affordance: `HoverKind` / `ProjectableHoverKind` / `isProjectableKind` / use-hover-context runtime check / hover-describer registry(`describeLine`) 에 "line" 추가 → 선 hover 시 frame-box affordance + 툴팁. weave `tsc` clean, e2e green.
- **WI-062 전부 완료** (Phase 1~6 + 잔여).

## Workflow trail

- Feasibility: `records/feasibility-reviews/FR-013-line-as-item-kind.md`
- Decision: `records/decisions/DR-025-line-as-distinct-item-kind.md`
- Plan: `features/line-item/ENGINEERING_PLAN.md`
- Cross-project: `../agocraft/records/decision-handoffs/HANDOFF-020-from-weave-line-kind.md`
- Supersedes-in-part: DR-024 (poly frame-follows / endpoint — 그 로직이 line kind 로 이전됨), WI-061
- Builds on: DR-023 (kind-owned selection chrome)
