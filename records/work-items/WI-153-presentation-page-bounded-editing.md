# WI-153 — 타입별 편집화면 + 프레젠테이션/문서 page-bounded(캔바식) 편집

Status: **In Progress** (P1·P2.1·P2.2 완료 · P2.5/P3/P4 일부 작업 중)
Owner: hbpark
Updated: 2026-06-10

> ⚠️ 2026-06-10 — "slide-deck 생성해도 mixed와 차이 없음" 보고는 본 WI의 결함이 아니라 생성→열기
> 핸드오프 리그레션이 page-bounded 편집을 가린 것. [WI-154](WI-154-new-design-create-handoff.md)에서 수정.
관련: [FR-024](../feasibility-reviews/FR-024-presentation-page-bounded-editing.md) · [DR-111](../decisions/DR-111-format-editor-config-and-page-bounds.md) · 엔지니어링 플랜 `features/presentation-page-editing/ENGINEERING_PLAN.md` · 리스크 `features/presentation-page-editing/RISK_NOTES.md` · 연동 [WI-150](WI-150-agent-container-is-frame-guard.md)(에이전트 컨테이너=프레임 가드)

## Problem (사용자 요청)

> 디자인 생성 시 선택한 타입에 맞게 편집화면을 구성하고 싶다. 첫 대상은 **프레젠테이션 전용 편집**이며,
> **캔바식 페이지 단위 편집**을 생각 중이다. 기존엔 어디에든 아이템을 추가할 수 있었지만, 이번엔 **페이지
> 영역 안에서만 편집**이 가능했으면 한다.

## 현황 진단 (탐색 요약 — 상세 FR-024)

- **타입 모델이 이미 있으나 잠들어 있음**: `DocFlavor`(mixed/slide-deck/canvas-board/doc-page)를 생성
  마법사에서 고르고 `root.attrs.flavor`에 영속. 에디터 분기는 **딱 한 줄** `infiniteCanvas = flavor ===
  "mixed" || "canvas-board"`(`DesignPage.tsx:1029`).
- **프레젠테이션 런타임 완성**: 프레임=슬라이드(`presentable`), `presentationOrder`(트리 독립), `/present`,
  PresentPage, 시퀀서 — 포맷 무관하게 동작. → 전용 편집은 *데이터 모델* 문제가 아니라 *에디터 크롬* 문제.
- **"페이지 = 최상위 프레임"이 이미 참**. presentationOrder가 페이지 네비게이션의 올바른 토대.
- **공간 경계 강제 코드가 아예 없음**: 이동=순수 translate(무클램프), 리사이즈=최소크기만, 부모 밖 허용,
  프레임 미클립(bleed는 기능). → page-bounded는 **푸는 게 아니라 더하는** 작업.

## 확정 결정 (7) — 상세/근거 DR-111

| # | 항목 | 확정 |
|---|---|---|
| 1 | 타입 식별 | 기존 `slide-deck` 재사용(마이그레이션 0) |
| 2 | 적용 범위 | **slide-deck + doc-page** = page-bounded / mixed·canvas-board = 무한 유지 |
| 3 | 캔버스 뷰 | 한 번에 한 페이지 + 썸네일 레일(카메라 `cameraFitBox` 락) |
| 4 | 경계 의미 | 페이지 소속 강제 + 가장자리 클립 + bleed 허용 |
| 5 | 오프페이지 | 소프트 클램프 — 최소 일부는 항상 on-page(분실 방지) |
| 6 | 페이지 추가 | 빈 페이지(기본 `+`) + 페이지별 복제 액션 |
| 7 | 발표/출력 | 편집과 동일 페이지 경계 클립(WYSIWYG) |

## 단계 (상세 ENGINEERING_PLAN)

- **P1** 포맷 레지스트리(`infiniteCanvas` boolean → `FORMAT_EDITOR_CONFIG`) — 동작 변화 0, Rule 6 정리.
- **P2** 한 페이지 캔버스(활성 페이지 카메라 락 + 썸네일 레일).
- **P3** 소속 + 클립 + 소프트 클램프(기본 추가 컨테이너 = 활성 페이지).
- **P4** 추가/에이전트 흐름(활성 페이지 타깃, 프레젠테이션 에이전트 root 배치 금지).
- **P5** 생성/크롬 + 발표·출력 클립 정합.

## 다음 액션

P1 착수(포맷 레지스트리). 동작 변화 없는 안전한 첫 발 → SVL/타입체크 green 확인 후 P2.
