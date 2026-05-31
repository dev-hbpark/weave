# Technical Feasibility Review — FR-013 Line as a distinct item kind (`line`)

| Field | Value |
|---|---|
| ID | FR-013 |
| Triggering WI | WI-062 |
| Date | 2026-05-31 |
| Reviewer | hbpark |
| Verdict | **FEASIBLE WITH TRADE-OFFS** |

## Requested outcome

선을 도형과 **완전히 다른 top-level item kind** 로 분리: agocraft 에 `line` kind 신설, 스트로크 전용 속성, 양끝 endpoint marker(화살표/동그라미 등).

## What current tech can deliver

- agocraft kind 시스템은 **개방형**: `SelectionInfo.itemKind` 등 free string, DocumentType `allowedChildKinds`, capability/selection-chrome 레지스트리가 모두 kind-agnostic(DR-023). 새 kind 추가는 아키텍처적으로 **지원됨** — `text`/`shape`/`image`/`video`/`qr` 가 선례.
- 끝점 marker 는 이미 존재(`ArrowHeadStyle` + `ArrowHeads` + SVG `marker-start/end` + `ArrowMarker`). `arrow` sub-kind 가 사용 중 → 재사용 가능.
- 정점/끝점 편집(frame-follows + endpoint similarity)은 DR-024 에서 poly 로 이미 구현 → line kind 로 이식 가능.
- stroke-only 렌더는 ShapeBlock 의 `strokeOnly` 경로가 이미 존재.

## Intrinsic ceiling / trade-offs (불가피)

1. **범위**: 새 kind = agocraft schema + 기본 factory + geometry + serializer + builtin 등록 + capability 등록 + **마이그레이션** + weave 도메인(renderer) + DomainKind/allowedChildKinds + selection VM + LineSection + add-menu + **기존 데이터(현 open-poly 선) 마이그레이션** + agocraft 재벤더. 다(多)패키지·다단계.
2. **크로스프로젝트**: agocraft(sibling)의 DR-013(factory)·DR-011(mirror types)·Rule 6 컨벤션 준수 필요. HANDOFF-020 로 추적.
3. **마이그레이션 위험**: 직전 WI-061/DR-024 에서 만든 `shape`+`poly`(open) 선들을 `line` kind 로 변환해야 일관. v13→v14 마이그레이션 + 무손실 round-trip 검증 필요.
4. **재벤더**: weave 는 agocraft 를 tarball 로 소비. core 변경마다 repack 필요(agent-client small-think 의존성 이슈로 **core-only 타겟 repack** 으로 우회 — 검증된 절차).
5. **중복**: poly(shape)와 line 이 거의 동일한 geometry/vertex 로직을 가짐 → 공유 헬퍼로 묶지 않으면 중복. 공유 모듈화 권장.

## Boundary: 새 kind vs UI-분리 (기각된 대안)

UI-레벨 분리(shape/poly 유지 + LineSection + heads)는 동일 UX 를 **훨씬 낮은 비용**으로 제공하나, 사용자가 "완전 다른 타입"을 명시 선택(트레이드오프 인지). 본 FR 은 그 선택을 전제로 새-kind 경로의 타당성·비용을 박제한다.

## Verdict

**FEASIBLE WITH TRADE-OFFS.** 기술적으로 가능하고 선례·재사용 자산이 충분하나, 다패키지·마이그레이션·재벤더로 **주 단위·다단계** 작업. 단계별(ENGINEERING_PLAN) + 각 단계 e2e 가드 + 무손실 마이그레이션 검증으로 리스크 관리. 행위/데이터 보존이 게이트.

## Links

- WI-062, DR-025, `features/line-item/ENGINEERING_PLAN.md`, agocraft HANDOFF-020
