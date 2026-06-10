# WI-159 — 멀티셀렉트 그룹 단위 min-overlap (페이지 소프트 클램프)

Status: **Done**
Owner: hbpark
Updated: 2026-06-10

관련: [WI-153](WI-153-presentation-page-bounded-editing.md)(P3 잔여 슬라이스) · [DR-111](../decisions/DR-111-format-editor-config-and-page-bounds.md) 결정 5(소프트 클램프) · 플랜 `features/presentation-page-editing/ENGINEERING_PLAN.md`

## Problem

WI-153 P3의 소프트 클램프는 **페이지 직계 자식별 개별** 적용이다. 멀티셀렉트 드래그는 모든
멤버를 같은 델타로 평행이동하는데, 멤버마다 자기 클램프 한계에 **다른 델타에서** 도달하므로
페이지 가장자리에서 멤버들이 하나씩 멈추며 **그룹 상대 배치가 찌그러진다**.

## 결정 — 그룹 강체(rigid) 클램프: 공유 델타를 한 번만 클램프 (멤버 구간 교집합)

- 멤버별 위치 클램프 대신 **공유 델타를 클램프**: 제스처 시작 시 움직이는 페이지 직계
  멤버들의 박스를 캡처하고, **각 멤버의 허용 델타 구간(clampAxis의 델타형)을 교집합**한 뒤
  공유 델타를 그 안으로 자르고 **모든 멤버에 같은 클램프 델타**를 적용(`clampSharedDelta`)
  → 상대 배치가 구성상(by construction) 보존 + **모든 멤버가 각자 min-overlap 유지**.
- **유니온 박스 클램프는 기각**: 유니온만 overlap을 지키면 뒤따르는 멤버가 페이지 밖으로
  완전히 나갈 수 있음 — DR-111 D5의 per-item "분실 방지" 불변식 위반(클립으로 보이지도
  클릭되지도 않음). 교집합 방식은 강체성 + D5 둘 다 만족. 각 멤버의 시작 위치가 유효하면
  교집합은 공집합이 되지 않음(시작 위치 자체가 이전 클램프의 산물); 방어적으로 공집합이면
  hi 경계로 결정적 처리(NaN 없음).
- **벤더 코드 비접촉**: agocraft `FrameMoveBinding`은 `snap.begin(primary, movingItemIds)`로
  실제 이동 대상 집합을 첫 `computeMove` **이전에** 호스트에 알려준다(ESC/up 시 `snap.end`
  보장). weave의 `frameMoveSnap`을 래핑해 begin에서 페이지 직계·비회전 멤버 박스들을 ref에
  캡처(멀티 제스처일 때만), end에서 해제. `computeMove`는 그룹 ref가 있으면
  `clampSharedDelta`, 없으면 기존 멤버별 클램프(단일 선택 동작 불변).
- **강체성 보장 논거**: 페이지 직계 멤버들은 같은 부모 요소 → 캡처된 parent rect 동일 →
  비율 델타 `dx/parent.width` 동일 + 멤버 집합·spec 동일 → 순수 `clampSharedDelta`가 멤버별
  독립 호출에서도 같은 클램프 델타를 산출.
- Shift-드래그(단일 이동) 분기는 binding이 `movingItemIds=[하나]`만 전달 → 그룹 미발동(정확).
- 회전 멤버: 제약(constraint)에는 불참(기존 "회전 스킵" 일관) — 단 그룹과 함께 강체로
  평행이동. 회전 시각 AABB 정합은 별도 슬라이스(WI-153 잔여 "회전 박스 경계 정합").

## Out of scope (문서화된 엣지)

- 페이지 직계가 아닌 멤버(중첩 자식)가 섞인 멀티셀렉트: 그 멤버는 클램프 스펙이 없어 raw
  델타로 움직임 — 유니온이 가장자리에 걸리면 그 멤버만 상대 드리프트. 기존 동작도 동일하게
  찌그러졌으므로 회귀 아님. 발생 빈도 낮음(페이지 직계끼리의 멀티셀렉트가 지배적).

## 검증 (전부 green, 2026-06-10)

- 유닛: `clampSharedDelta` 5케이스 추가 (page-clamp.test.ts 13/13 — 가장 제한적인 멤버가
  바인딩, 강체성, per-member min-overlap, 축 독립, min보다 작은 멤버). 전체 스위트
  **960/960** (97 파일).
- SVL (라이브 브라우저, 삭제됨): slide-deck 2개 아이템 — 단일 드래그 회귀(A가 자기 한계
  minX=0.025에 핀, B 불변, undo 복원), 멀티셀렉트 좌측 드래그(gap 0.5 정확 보존, A 핀 +
  블리드, B min-overlap 유지, y 불변), 우측 드래그(B가 1-minX=0.975에 핀, gap 보존) —
  **10/10 체크**.
- e2e 영구 스펙: `e2e/page-group-clamp.spec.ts` (P3 단일 클램프 + WI-159 그룹 강체 클램프)
  **2/2 passed**.
- 게이트: tsc clean, biome clean, tokencheck/declarativecheck/puritycheck/inheritancecheck
  모두 OK.

## 비고 — 동시 세션

WI-156(delta-persistence) 세션이 같은 repo에서 동시 진행 가능 — 커밋은 본 WI 파일만
명시 경로 스테이징.
