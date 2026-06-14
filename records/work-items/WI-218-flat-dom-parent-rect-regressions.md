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

## 회전 후속 DONE (2026-06-14, 브랜치 `fix/rotated-parent-resize`)

회전된 부모에서의 리사이즈를 정확화. 두 결함이었음: (a) `getBoundingClientRect`는 회전 부모의 **팽창된 AABB**
반환 → 스케일 오차, (b) `computeResizeFrame`은 화면 델타를 부모-로컬 x로 그대로 써서 **방향** 미투영(회전 0에서만
정상). 수정(리사이즈 sink 국소, `parentRectOf`/이동 무변경):

- 제스처 시작에 `computeScene`로 **부모 EXACT 로컬 박스**(design px × 플레인 스케일; 회전-불변 w/h) + 아이템
  **절대 회전**(own+조상) 캡처.
- 매 틱 화면 델타를 `-절대회전`으로 **역회전**해 아이템 로컬 축으로 투영 후 `computeResizeFrame`에 전달.
  (스크린 y-down ↔ 표준행렬 부호는 `cos(-θ)/sin(-θ)`로 흡수; 90° 검증.)
- 회전 0이면 cos1/sin0 + 박스=bbox와 동치 → **공통 경로 무변경**(언로테이트 1:1 e2e 통과로 확인).

검증: e2e `nested-resize.spec.ts` 2번째(90° 회전 부모: 보이는 east 핸들=화면 수직, 드래그 시 width 성장; **수정 전엔
width 불변=0.4 → 회귀 가드**) + 기존 1:1 테스트 + hug-resize 8 + page-group-clamp 3 + weave unit 1368 전부 green.

## 이동(move) 회전 후속 DONE (2026-06-14, 브랜치 `fix/rotated-parent-move`)

회전된 부모 안의 자식을 **드래그-이동**하면 커서를 안 따라오고 부모-로컬 축으로 드리프트(예: 90° 부모에서 화면-오른쪽
드래그 → 자식이 화면-아래로 이동)하던 문제. 리사이즈와 동일 계열(프레임=부모-로컬 ratio, 화면 델타 미투영).

수정(호스트 국소, 벤더 바인딩 무변경):
- `parentRectOf`를 scene 기반으로 재작성 — 부모 **EXACT 로컬 박스**(computeScene design px × 플레인 스케일,
  회전-불변) + **`__rotation`**(부모 절대 회전)을 opaque parent rect로 전달(`__pageClamp` 옆에). bbox(회전 시
  팽창) 대신 정확 dims. 제스처 시작에 타깃당 1회만 호출(틱당 아님)이라 computeScene 1회 OK.
- `computeMove`가 `parent.__rotation`으로 화면 델타를 부모-로컬 축으로 역회전 후 ratio 변환. 회전 0 → 항등(공통 경로
  무변경). (이동 방향엔 부모 회전만 관여 — 아이템 자기 회전은 WI-160 AABB 클램프에만.)

검증: e2e `nested-resize.spec.ts` 3번째(90° 부모 자식 화면-오른쪽 드래그 → 화면-x 추적·y≈0; **수정 전 dx=0,dy=207
드리프트 → 회귀 가드**) + page-group-clamp 3(회전 WI-160 포함)·page-artboard 무회귀 + weave unit 1368 green.

## 잔여

- 비-균일 스케일(현재 플레인 aspect-보존이라 균일 가정) 및 회전+aspect-lock 코너의 상호작용은 더 깊은 케이스 —
  필요 시 후속.
