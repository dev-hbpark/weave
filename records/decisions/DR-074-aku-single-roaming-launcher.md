# DR-074 — One roaming launcher Aku (supersedes the separate field-agent)

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-107
- **Supersedes:** DR-073 (separate roaming `AkuFieldAgent` overlay) — caused "two Akus".
- **Relates:** WI-104(엔진/스프라이트), WI-105(인터랙션 락), use-weave-editor changeStream.
- **Operator directive (2026-06-06):** 패널을 닫으면 아쿠가 둘이 됨 → 그러지 말고 **런처 아쿠
  하나만**; 그 아쿠가 **랜덤 위치로 이동**하되 순간이동이 아니라 **움직이는 모습이 보여야** 함;
  닫혔을 때 그 말풍선 아쿠를 클릭하면 패널이 다시 열림.

## Context

DR-073는 고정 런처(홈) + 별도 로밍 `AkuFieldAgent`를 동시에 띄워 **닫힘+작업중에 아쿠가 둘**로
보였다. 운영자는 단일 아쿠가 화면을 돌아다니길 원한다.

## Decision

### D1 — 단일 아쿠 = 런처. 별도 field-agent 제거.
`AkuFieldAgent`/`field-agent-target` 삭제. 닫힘 상태의 유일한 아쿠는 런처. 열림 → 패널만(런처
숨김, 겹침 방지). 닫힘 → 로밍 런처. (메시지: "열렸을 땐 없다가 닫았을 때 하나만".)

### D2 — 런처가 화면을 WANDER. `useAkuRoam` 훅.
- 유휴: ~3.6s 간격으로 **랜덤 뷰포트 점**으로 이동.
- 작업중(streaming): editor.changeStream(user-command) → 편집된 프레임 rect로 이동(디바운스).
- 위치는 `left/top` + CSS 트랜지션(~1100ms)으로 **글라이드**. 스케줄러(인터벌/구독)는 **한 번만**
  설치하고 live 플래그를 ref로 읽어, 리렌더(특히 paused 토글)에 인터벌이 리셋되지 않게 한다
  (이 리셋이 wander 미발화의 원인이었음).

### D3 — 이동 중엔 move 스프라이트(움직이는 모습).
`moving`이면 spriteMood = dir==="left" ? `connecting`(move-left) : `looking`(move-right);
도착하면 expression.mood. → 글라이드 + 걷는/나는 프레임이 함께 보임("그냥 이동 아님").

### D4 — 클릭 → 패널 열기. 드래그 제거.
런처는 닫힘일 때만 보이므로 onClick → setOpen(true). 수동 드래그는 로밍이 대체(제거).
인터랙션 락 동안에도 런처는 exempt + scrim 위라 클릭으로 열림(WI-105).

### D5 — 팁은 로밍 런처의 캡션 말풍선으로(앵커 팁 제거).
Radix `AkuTipBubble`(고정 앵커)은 움직이는 런처를 못 따라가므로 제거. `useAkuTips`의 tip을
런처 **caption**으로 표시(런처와 함께 이동, 자동 숨김 14s/쿨다운 유지). 따라서 tip은 로밍을
멈추지 않는다(paused = open || 첫실행 coachmark만). 첫실행 coachmark는 안정 앵커가 필요해
표시 중 로밍 정지.

### D6 — reduced-motion: 로밍/스프라이트 정지(홈 고정).

## Consequences

- (+) 아쿠 하나만, 화면을 살아 움직이며 돌아다님(글라이드+move 스프라이트). 클릭→열기.
- (+) 열림 시 패널만(겹침 없음). producer 무수정(changeStream 구독만).
- (−) 수동 드래그 제거(로밍이 위치를 소유) · Radix 앵커 팁 제거(캡션으로 대체, 수동 dismiss 버튼 없음).
- (−) 이동 중 `data-mood`가 connecting/looking으로 바뀜(move 스프라이트 선택용) — e2e는 이를 감안.
