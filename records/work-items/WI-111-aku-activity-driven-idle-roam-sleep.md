# WI-111 — 아쿠 편집-활동 기반 대기/로밍/수면 (idle ↔ roam ↔ sleep)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-074(단일 로밍 런처) 위 확장 · DR-070(expression seam 유지) |
| Relates | WI-107(로밍) · WI-108(드래그) · WI-103/WI-104(expression/엔진) |

## Problem (operator, 2026-06-06)

런처 아쿠의 동작을 **사용자의 실제 편집 활동**에 맞춰 정리하고 싶다:

- 사용자가 **편집 중**(포커스 상태의 포인터/키보드 이벤트)일 때는 **원래 자리(home)에서 idle 대기**.
- 사용자가 **편집하지 않을 때**는 (지금처럼) **랜덤 위치로 이동**.
- 편집 없이 **1분 이상 경과**하면 **이불 덮고 자는(doze) 액션**.
- 다시 **편집을 시작**하면 **제자리로 돌아와 idle 대기**.
- 수면 전용 스프라이트는 추후 적용 — 지금은 **idle 스프라이트로 수면 액션을 연결**.

## Design (SOLID/GRASP)

핵심: "사용자가 편집 중인가"는 **포인터/키보드 활동을 보는 쪽만** 알 수 있다 → 위치를 소유한
`useAkuRoam`이 활동 감시 + 단계(phase)를 **소유**한다(Information Expert). 기존 `useAkuExpression`은
status 기반 90s `sleeping` 타이머를 **자체 소유**했는데, 이는 실제 편집(키 입력 등)을 보지 못하고
위치 개념도 없어 본 요구를 만족 못 함 → **`sleeping`을 입력으로 주입**받도록 변경(단일 출처).
mood 우선순위 테이블(`resolveAkuMood`)은 그대로 단일 중재자로 유지(streaming/celebrate > sleeping).

`useAkuRoam` 단계 머신(1초 틱 드라이버, `dt = now - 마지막 편집 시각`):

- `dt < EDIT_SETTLE_MS(4s)` → **editing**: home으로 글라이드 복귀 + idle.
- `EDIT_SETTLE ≤ dt < SLEEP_AFTER_MS(60s)` → **roaming**: `IDLE_MS(3.6s)`마다 랜덤 이동.
- `dt ≥ 60s` → **sleeping**: **화면 정중앙으로 이동(visible) 후** doze(`sleeping` mood). 진입 시
  1회 `goTo(center)` — 이동 중엔 move 스프라이트, 도착(`moving` 해제) 후 sleep 스프라이트.
- streaming(에이전트 작업) → 기존 changeStream fly-to-frame가 위치 소유 + 활동으로 간주
  (작업 직후 즉시 수면 방지). drag는 항상 우선. reduced-motion은 정지.
- **paused(패널 열림/코치마크)** → 위치는 정지하되 **매 틱 `lastActivityRef` 갱신**(= 활동으로 간주).
  패널 사용/여닫기는 사용자 동작이므로, 패널에 머문 시간이 수면 타이머를 늙히면 안 됨 — 미적용 시
  60초 넘게 패널을 열어두었다가 닫는 순간 즉시 수면하는 버그(2026-06-06 후속 수정).

활동 판정(`window` capture): pointerdown·keydown·wheel·버튼 누른 채 pointermove만 "편집"으로 계수.
**맨 호버(버튼 0)·아쿠 표면(자기 드래그)은 편집이 아님**(`isAkuSurface` 제외). 수면 중 캡션은
tip 대신 `Zzz… (눌러서 깨우기)`.

mood→스프라이트는 변경 없음: `sleeping → /aku/sprites/idle.png`(이미 매핑, MASCOT.md). 추후 전용
수면 시트가 오면 `gpu-sprite-renderer` 한 줄 교체로 반영.

## Acceptance

- [x] 사용자가 편집 중이면 아쿠가 home에서 idle 대기(이동 안 함).
- [x] 편집을 멈추면(4s+) 랜덤 위치로 이동(이동 모습 visible).
- [x] 편집 없이 1분 경과하면 **화면 정중앙으로 이동 후** 수면(현재 idle 스프라이트) + Zzz 캡션.
- [x] drag(버둥) 스프라이트를 신규 시트로 교체(3120×724, 520×724 — 타 시트와 통일).
- [x] 편집 재개 시 제자리(home)로 복귀해 idle 대기(수면 해제).
- [x] streaming(에이전트 작업)·드래그·reduced-motion·코치마크와 충돌 없음.

## Verification (SVL gate — 2026-06-06)

- tsc 0(aku 파일) · biome clean(변경 파일; 잔여 6 warning은 무관 기존 파일) · 아쿠 단위 66/66.
- 아쿠 e2e 12/12 (chat 9 + expression 3 + 신규 `aku-roam.spec.ts` 1: editing→home /
  quiet→roam(>120px 이동) / resume→home).
- 1분 수면 경로는 동일 dt 기반 코드라 **장시간 1-회 진단**으로 별도 확인(루틴 suite엔 미포함 —
  매 실행 +1분 방지): t=30s `idle`(미수면) → ~60s `data-mood="sleeping"` + 캡션 `Zzz…` →
  편집(Escape) 시 깨어나 home으로 글라이드(mood `connecting`, 도착은 roam 테스트가 보장).
- **수면-정중앙** 1-회 진단: ~60s 후 `sleeping` + 런처 위치 **(597,300)** = 1280×720 뷰포트의
  정확한 중앙((vw−86)/2, (vh−120)/2). 통과.
- **패널-수면타이머-리셋** 1-회 진단: 패널을 **66초** 열어둔 뒤 닫음 → 닫은 직후 5초간 mood가
  한 번도 `sleeping`이 아님(`sawSleep=false`, idle 유지). 통과.
- drag 스프라이트 교체: 드래그 중 `data-mood="dragging"` + 신규 시트(버둥 + 모션선) 렌더 스크린샷 확인.
- aku-roam.spec 안정화: 2단계(로밍)를 단일 poll 순간값 대신 **샘플 루프 최대 변위**로 판정
  (랜덤 홉이 잠깐 home 근처에 떨어져도 flake 없음 — 무재시도 3회 연속 통과).
- (참고) 무관 파일 `ImageBlock.tsx`/`corner-radius-field.tsx`(사용자 untracked WIP) 타입오류는 본 작업 밖.

## Notes

- 번호: 사용자 WIP가 WI-108/109를 선점 → 아쿠 작업은 WI-110(spotlight)·WI-111(본건)으로 채번.
- `useAkuExpression`의 `SLEEP_MS(90s)` 자체 타이머 제거(주입형으로 전환) — 데코미션 스윕.

See DR-074 / DR-070. 동작 매핑/에셋: MASCOT.md.
