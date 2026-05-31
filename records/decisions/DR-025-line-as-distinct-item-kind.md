# Decision Record — DR-025 Line as a distinct item kind (`line`)

## Metadata

| Field | Value |
|---|---|
| ID | DR-025 |
| Title | 선(직선/자유선/곡선/자유곡선)을 `shape` 의 sub-kind 가 아니라 agocraft 의 **독립 top-level item kind `line`** 로 분리한다. line 은 스트로크 전용(점 + 선택적 smooth) + 양끝 endpoint marker(`heads`)를 갖고, fill/도형 속성을 갖지 않는다. |
| Decision Level | **2 Cross-project** — agocraft(@agocraft/core 등) 스키마·렌더·커맨드 신설 + weave 도메인/UI. agocraft 측은 HANDOFF-020 으로 추적. |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-05-31 AskUserQuestion: "완전히 새 item kind" 명시 선택, 트레이드오프 인지) |
| Status | **Accepted** |
| Decided on | 2026-05-31 |
| Triggering WI | WI-062 |
| Pairs with | FR-013, DR-023(kind-owned chrome), DR-024(poly frame-follows/endpoint — line 으로 이전), DR-013(agocraft factory), DR-011(mirror types) |

## Context

DR-024/WI-061 에서 선을 `shape`+`poly`(open) 로 모델링했으나, 사용자는 "도형과 선은 완전 다른 타입 / 선은 스트로크만 / 양끝 마커"를 요구. UI-레벨 분리(저비용) 대신 **새 kind**(고비용·고분리)를 명시 선택(FR-013).

## Decision

1. **새 kind `line`** (agocraft `LINE_KIND = "line"`). `LineAttrs`:
   - `frame: ItemFrame`
   - `points: ReadonlyArray<PolyPoint>` (0..1 of bbox; ≥2)
   - `smooth?: boolean` (Catmull-Rom 곡선)
   - `heads?: { start: ArrowHeadStyle; end: ArrowHeadStyle }` (none/triangle/open/diamond/circle 재사용)
   - **fill 없음**. 색/굵기/대시는 `decoration.stroke` 유닛(스트로크 전용).
2. **Geometry**: 항상 stroke-only(`strokeOnly:true`). straight → `<polyline>`, smooth → bezier `<path>`; `heads` → `marker-start`/`marker-end`(arrow 마커 재사용). poly 의 geometry/마커 로직을 **공유 헬퍼**로 추출해 재사용(중복 회피).
3. **편집**: DR-024 의 frame-follows-vertices + 끝점 균등 similarity + (선택 크롬: resize/rotate 없음, vertex/endpoint 핸들만) 를 line kind 로 이식. 공유 모듈화.
4. **속성 패널**: weave `LineSection`(stroke + start/end head + opacity). `register("line", LineSection)`. fill/코너 등 도형 속성 없음.
5. **add-menu**: "선" 카테고리(직선/자유선/곡선/자유곡선)는 이제 `line` kind 를 생성(2pt/다점/smooth + heads default none).
6. **마이그레이션**: 기존 `shape`+`poly`(open) 및 `shape`+`line`/`arrow` 를 `line` kind 로 변환(v13→v14, 무손실 round-trip). 닫힌 poly/도형은 shape 유지.
7. **agocraft 컨벤션 준수**: factory `defaultLineAttrs`(DR-013), renderer-agnostic mirror types(DR-011), kind 분기는 registry(Rule 6).

구현 단계·검증은 `features/line-item/ENGINEERING_PLAN.md`. agocraft 측 스키마/렌더/커맨드 요청은 HANDOFF-020.

## Why this option

- 사용자 명시 선택(트레이드오프 인지).
- agocraft kind 시스템 개방형 + 선례(text/shape/image/video/qr) → 아키텍처 지원.
- 끝점 마커·정점 편집·strokeOnly 자산 재사용으로 신설 비용 일부 상쇄.
- 도형↔선 의미 분리가 속성 패널·직렬화·향후 확장(대시/캡/멀티-세그먼트)에서 깔끔.

## Consequences

- **Breaking/migration**: 기존 open-poly 선 데이터 → line kind 변환 필요(v13→v14). 무손실 검증이 게이트.
- **다패키지**: agocraft core(+의존 패키지) 변경 → core-only 타겟 repack 으로 재벤더.
- **중복 위험**: poly(shape)와 line geometry/vertex 로직 공유 모듈 필수.
- **범위**: 주 단위·다단계. 단계별 e2e 회귀 가드.
- DR-024 의 poly-open 끝점/refit 동작은 line kind 로 이전(닫힌 poly 의 frame-follows 는 shape 에 잔존).

## SOLID/GRASP gate (요약)

- Rule 6: line geometry/속성/핸들 분기는 kind registry/adapter 로 (switch 금지). 
- DRY: poly↔line 공유 geometry/vertex 헬퍼.
- OCP: 새 kind = 새 도메인/VM/Section 등록, 기존 코드 최소 변경.
- 무손실 직렬화(onUnknown preserve), round-trip 테스트.

## Dissent

없음 — 단, 엔지니어 권고로 UI-분리(저비용 동일 UX)를 제시했으나 사용자가 새-kind 를 명시 선택. 비용은 FR-013 에 박제.

## Links

- FR-013, WI-062, `features/line-item/ENGINEERING_PLAN.md`
- Cross-project: agocraft `records/decision-handoffs/HANDOFF-020-from-weave-line-kind.md`
- Reuse: `ArrowHeadStyle`/`ArrowHeads` (builtin-kinds.ts), `poly-vertex-handle.tsx` (DR-024), `shape-selection-view-model.tsx` (DR-023)
