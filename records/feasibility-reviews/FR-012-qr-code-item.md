# FR-012 — Data-driven QR code item

| Field | Value |
|---|---|
| ID | FR-012 |
| Date | 2026-05-30 |
| Work item | [WI-058](../work-items/WI-058-qr-code-item.md) |
| Verdict | **FEASIBLE** |

## Question

데이터 한 줄로 결정되는 QR 아이템을, 에이전트 친화적으로, weave-side만으로 추가할 수
있는가? 인코더 정확성은 어떻게 보장하는가?

## Findings

| 영역 | 상태 |
|---|---|
| 새 kind weave-side | **가능** — agocraft Document는 attrs 불투명; weave-only kind가 직렬화 round-trip + `DOMAIN_RENDERERS` 렌더. agocraft 변경/vendor bump 0. |
| 인코더 | Reed-Solomon+마스킹은 직접 구현 위험 → **검증된 MIT(Nayuki) 벤더링**. dependency-free ESM, 트리쉐이킹 친화. |
| 렌더 | matrix→단일 SVG `<path>`. fg/bg는 `paintToSvgFill`(그라데이션 재사용). `preserveAspectRatio`로 정사각 유지(스캔성). |
| 에이전트 | 생성=`weave.item.add(kind:"qr",attrsOverride:{data})`, 편집=`weave.item.update(attrs:{data})`. 기존 커맨드로 충분, 전용 커맨드 불필요. |
| 결손(발견) | `isDomainItem` 하드코딩 5-kind allowlist가 FrameStage 컬링 게이트 → qr 추가 필수(빠지면 무음 미렌더). |

## Trade-offs / 한계

- **단위/스캔성:** fg PaintSpec 그라데이션 허용 → 명도 대비는 사용자 책임. 정사각 강제.
- **로고 오버레이/모듈 디테일:** v1 제외(EC=H 필요). 모듈 스타일 square/dot/rounded만.
- **벤더 소스 @ts-nocheck:** 서드파티 verbatim — 타입검사 제외, 경계 wrapper만 타입체크.

## Verdict

**FEASIBLE.** weave-side만으로 완결, 인코더는 검증본 벤더링으로 정확성 확보. 위험 낮음.
