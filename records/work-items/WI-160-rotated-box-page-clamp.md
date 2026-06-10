# WI-160 — 회전 박스 경계 정합 (회전 아이템 페이지 소프트 클램프)

Status: **Done**
Owner: hbpark
Updated: 2026-06-10

관련: [WI-153](WI-153-presentation-page-bounded-editing.md)(P3 잔여 슬라이스) ·
[WI-159](WI-159-group-min-overlap.md)(그룹 클램프 — 회전 멤버 stance 인계) ·
[DR-111](../decisions/DR-111-format-editor-config-and-page-bounds.md) 결정 5/6 ·
플랜 `features/presentation-page-editing/ENGINEERING_PLAN.md`

## Problem

WI-153 P3의 소프트 min-overlap 클램프와 WI-159의 그룹 클램프 모두 **회전 아이템을 스킵**한다
(DR-111 "비회전 우선"). 회전 아이템은 단일 드래그로 페이지 밖으로 **완전히 나갈 수 있고**
(page clip 때문에 보이지도 않음 = D5 "분실 방지" 위반), 그룹 드래그에서 제약에 불참한다.

비회전 프레임 박스를 그대로 쓰면 안 되는 이유: 회전체의 **시각 경계는 회전된 AABB**다.
프레임 박스 기준 클램프는 넓게 회전한 아이템(예: 가로로 긴 텍스트 90° 회전)에서 시각적으로
이미 페이지 밖인데도 "on-page"로 판정하거나 그 반대가 된다.

## 결정 — 회전 AABB 기준 델타 클램프

- 순수 수학 `rotatedAabb(frame, aspect)` (page-clamp.ts): 회전(라디안, 렌더러와 동일 단위)된
  사각형의 **비율 공간 AABB**. 비율 공간은 축별 정규화라 회전이 축을 섞으므로 **부모 종횡비
  필요**: `aabbW = w·|cosθ| + (h/aspect)·|sinθ|`, `aabbH = h·|cosθ| + w·aspect·|sinθ|`
  (aspect = 부모 px 너비/높이), 중심 보존.
- **단일 드래그**: computeMove에서 회전 0이면 기존 `clampFrameToPage` 그대로(불변), 회전이면
  시작 프레임의 AABB를 멤버 1개로 `clampSharedDelta` — 델타를 자르고 프레임 위치에 적용.
  aspect는 computeMove가 이미 받는 부모 rect(px)에서 산출.
- **그룹 드래그**: WI-159 snap.begin 캡처에서 회전 멤버를 스킵하지 않고 **AABB 박스로 기여**.
  aspect는 페이지 DOM rect에서 1회 산출(멤버 전원이 같은 활성 페이지 직계라 동일).
- 리사이즈/회전 제스처 경로는 기존대로 무클램프(스코프 밖, P3와 동일 stance).

## 정확도 한계 (수용한 근사)

AABB min-overlap은 **회전체 실픽셀 overlap의 상한**이다 — 45° 회전 시 AABB 모서리 영역엔
콘텐츠가 없어, 대각 코너 탈출의 극단 케이스에서 AABB는 48px 겹치지만 실제 보이는 픽셀은
그보다 적을 수 있다. 수용 근거: (1) 이전 상태는 클램프 전무(완전 분실 가능)로 엄밀히 더
나빴고, (2) 셀렉션 크롬은 body 포털이라 클립되지 않아 핸들로 항상 회수 가능, (3) 90°·180°
등 축정렬 회전에서는 AABB가 정확. 실픽셀(회전 폴리곤 ∩ 페이지) 클램프는 비용 대비 과잉.

## 검증 (전부 green, 2026-06-10)

- 유닛: `rotatedAabb` 7케이스 (0/π 항등, 90° 스왑(aspect 반영), 45°, 음수각 대칭, aspect 0
  폴백, clampSharedDelta 통합) — page-clamp.test.ts 20/20, 전체 스위트 **969/969**.
- SVL (라이브 브라우저, 삭제됨): **8/8** — `weave.item.add`가 rotation ≠ 0 보존, 90° 회전
  단일 드래그 좌/우 핀이 공식값 정확 일치(x = −0.13125 / 0.93125), undo 복원, 그룹 드래그에서
  회전 멤버가 AABB 제약으로 **바인딩**(이전: 스킵 → 완전 이탈 가능) + gap 0.5 강체 보존.
- e2e 영구 스펙: `page-group-clamp.spec.ts` **3/3** (P3 단일 + WI-159 그룹 + WI-160 회전 —
  단일 핀 + undo 복원 + 그룹 기여).
- 게이트: tsc clean, biome clean, tokencheck/declarativecheck/puritycheck/inheritancecheck OK.

## 비고 — 동시 세션 / 번호

delta-persistence 세션과 같은 repo 동시 진행 — 커밋은 명시 경로 스테이징만.
**WI-159 번호 충돌 공지**: `WI-159-group-min-overlap.md`는 weave `73bf2d1`로 **커밋 완료**
(선점). 미커밋 `WI-159-delta-persistence-transmission.md`는 재번호 필요 →
[HANDOFF-001](../handoffs/HANDOFF-001-wi-number-collision.md). 본 WI가 WI-160을 선점한다.
