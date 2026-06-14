# WI-218 — Flat-DOM `parentRectOf` / page-group regressions (nested resize tracks pointer)

- **Status:** DONE · 2026-06-14
- **Branch:** `fix/nested-resize-parent-rect` (weave-only; no re-vendor)
- **Relates:** WI-217 / DR-138 (flat scene renderer — root cause), WI-153/WI-159/WI-160 (page clamp), WI-183 (resize handle pipeline)
- **Driver:** 운영자 — "중첩 프레임 내부 아이템을 핸들로 크기조정하면 마우스 포인터가 핸들보다 더 많이 움직여야 한다(저감응)."

## 증상

중첩된 프레임 안의 아이템을 리사이즈 핸들로 조정하면 아이템이 포인터보다 **덜** 커진다(포인터를 더 움직여야 함).
top-level 아이템은 정상; **중첩일수록 심함**.

## 근본 원인 (WI-217/DR-138 잠복 회귀)

평면 씬 렌더러는 모든 프레임을 디자인 플레인 아래 **형제**로 그린다(DOM 중첩 없음). 그런데 리사이즈/이동
경로가 `el.parentElement`(= 플레인, 모든 아이템 공통)을 **논리적 부모**로 가정했다:

1. `FrameStage.frameAccess.parentRectOf` = `findFrameElement(itemId).parentElement.getBoundingClientRect()`
   → 모든 아이템에 대해 **플레인 rect**(전체 디자인 크기) 반환. `computeResizeFrame`은 `nextRatio = orig +
   dx_screen / parent.width` 이므로, 중첩 아이템의 진짜 부모(작은 내부 프레임) 대신 거대한 플레인 폭으로 나눠
   비율 증가분이 과소 → 아이템이 포인터보다 덜 커짐. (top-level은 부모=root=플레인이라 우연히 정상.)
2. 페이지-그룹 클램프 `begin()` = `el.parentElement.closest("[data-frame-id]")` → 플레인엔 frame-id 없음 →
   page-direct 멤버 미검출 → `pageMoveGroupRef` 비어 멀티-셀렉트 그룹 클램프(WI-159) 무력화. 단일-아이템
   클램프(WI-153)도 `parentRectOf`의 `__pageClamp` 경유라 동시에 깨져 있었음.

## 수정 (둘 다 동일 패턴 — 논리적 부모를 doc에서 해석)

- `parentRectOf`: `findParentAndIndex(doc, itemId)`로 논리적 부모 id를 얻어 그 프레임의 렌더된 요소
  (`[data-frame-id=parentId]`, root면 디자인 플레인) rect를 읽는다. `__pageClamp`도 `pages.has(parentId)`로
  직접 판정(이전엔 깨진 closest 의존). 회전 부모는 bbox 근사(기존 한계 동일, 별도 후속).
- 페이지-그룹 `begin()`: 멤버의 page-direct 판정을 `findParentAndIndex` 기반으로 교체, pageAspect는 페이지
  요소를 id로 쿼리해 측정.

## 검증

- 신규 라이브 e2e `nested-resize.spec.ts`: 중첩 아이템 east 핸들 D=120px 드래그 → 아이템 화면폭 +≈120(1:1).
  **수정 전 +60(=D×0.5, O가 디자인 절반) 으로 실패 → 회귀 가드 확정.**
- `page-group-clamp.spec.ts` 3개(단일/멀티/회전) **전부 통과**(수정 전 baseline 3 실패 → 이 수정으로 복구).
- weave unit 1368 무회귀. hug-resize 8 / page-artboard 통과.
- `layout-constraints-verify` 7 실패는 **선재 베이스라인**(networkidle 샌드박스; 핸들-존재/reparent/메뉴,
  리사이즈 델타·클램프 무관) — 본 수정과 무관.

## 잔여

- 회전된 부모의 정확 박스(현 bbox 근사) — `computeScene` 기반 회전-인지 부모 박스는 후속(리사이즈 수학 자체가
  회전 부모 미지원이라 동일 스코프 아님).
