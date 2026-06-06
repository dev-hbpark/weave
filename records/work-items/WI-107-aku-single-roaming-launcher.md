# WI-107 — 단일 로밍 런처 아쿠 (움직이는 모습으로 랜덤 이동, 클릭 시 패널)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-074 (supersedes DR-073) |
| Relates | WI-104(엔진/스프라이트) · WI-105(락) · WI-106(field-agent, 대체됨) |

## Problem (operator, 2026-06-06)

패널 닫으면 아쿠가 둘 → 런처 아쿠 하나만. 그 아쿠가 랜덤 위치로 **움직이는 모습이 보이게**
이동. 닫힘 시 클릭하면 패널 열림.

## Change

- 삭제: `AkuFieldAgent.tsx`, `field-agent-target.ts(+test)`, `AkuTipBubble.tsx`(앵커 팁).
- 신규: `roam-target.ts`(roamPointInRect/randomViewportPoint/travelDir, 순수) + `roam-target.test.ts`;
  `useAkuRoam.ts`(유휴 랜덤 인터벌 + streaming changeStream→프레임, ref-기반 안정 스케줄러).
- `AkuLauncher.tsx`: 위치 `left/top` + 트랜지션(글라이드, motion-reduce 정지) · cursor-pointer ·
  caption wrap(팁 수용).
- `AkuAssistant.tsx`: 단일 런처 렌더(열림→패널만, 닫힘→로밍 런처). roam 위치 주입, 이동 중
  spriteMood=connecting/looking(move 스프라이트), caption=work말풍선 ?? 유휴팁, onClick→열기.
  paused = open || showCoachmark(첫실행만).

## Acceptance

- [x] 아쿠는 항상 하나(런처). 열림 → 패널만, 닫힘 → 로밍 런처(둘 안 됨).
- [x] 런처가 랜덤 뷰포트 위치로 이동하며 **이동 중 move 스프라이트**가 보인다(글라이드+프레임).
- [x] 닫힘 상태에서 런처 클릭 시 패널이 열린다(락 중에도 exempt).
- [x] 작업중(streaming)엔 편집 프레임으로 이동 · reduced-motion 시 로밍/스프라이트 정지(홈).

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome clean(변경 파일) · 아쿠 단위(roam-target 포함) green · 아쿠 e2e 11/11 회귀 없음.
- 통합(diag, coachmark 선-seen): 런처 computed left/top이 시간에 따라 5개 위치로 변화(랜덤 이동
  실동작) · 이동 중 data-mood가 looking/connecting(move 스프라이트)로 전환 확인.
- **버그 수정 기록**: 인터벌이 매 리렌더(paused 토글)마다 리셋돼 wander 미발화 → 스케줄러를
  1회 설치 + ref 플래그로 변경; tip을 paused에서 제외(앵커 팁 제거, 캡션으로 이동).

## Follow-up — 스프라이트 너비 조정 반영 (2026-06-06)

사용자가 스프라이트 프레임 너비를 확장(시트 2172→**2580**, 프레임 362→**430**, 종횡비
0.5→**≈0.59** — 캐릭터 클리핑 방지/여백). 또한 세트에서 `editing`(+`spell-right`) 시트 제외 →
현재 5종(idle/thinking/idea/move-left/move-right) + mascot, 모두 투명.
- 렌더 박스 종횡비 갱신: 런처 `w-15 h-30`(60×120) → `w-18 h-30`(**72×120**), roam `boxW` 60→**72**.
- `working` mood가 삭제된 `editing.png`를 참조 → **`idea`로 리매핑**(celebrating도 idea). cols=6 유지
  (엔진 frame_rect이 시트너비/6=430으로 자동 산출 → 코드 변경 불필요).
- 검증: 전 스프라이트 `hasAlpha:yes` · 스프라이트 404 없음 · 런처 box 72×120(0.6) · 스크린샷에서
  캐릭터 클리핑 없이 박스 채움 · tsc(aku 파일) 0 · biome clean · 아쿠 e2e 11/11.
- (참고) 무관 파일 `corner-radius-field.tsx`(사용자 untracked WIP)에 별개 타입오류 존재 — 본 작업 밖.

See DR-074. Assets: MASCOT.md.
