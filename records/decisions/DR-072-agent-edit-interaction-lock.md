# DR-072 — Lock app interaction to the Aku panel while the agent is streaming

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-105
- **Relates:** WI-052/AkuAssistant (panel/launcher portaled to `document.body`),
  small-think `AkuStatus` (`idle`/`streaming`), editor hotkeys (`createInputBus({target: window})`),
  InteractionMode, Dialog (z-40/50).
- **Operator directive (2026-06-06):** 에이전트 편집 중에는 아쿠 패널만 조작 가능하고 다른
  영역 인터랙션을 막고 싶다.

## Context

Aku 패널/런처는 `document.body`에 portal → `#root`(앱)의 **형제**. 편집 신호는 이미
`status: "idle" | "streaming"`로 존재. 전역 단축키는 `window`에 등록되어 있어 — **포인터만
막아선 부족**하고 키보드까지 막아야 함. `inert`는 포인터·포커스·a11y를 한 번에 막지만
**window 레벨 keydown 리스너는 못 막는다**(검토 결과).

블로킹은 UX 편의가 아니라 **정합성** 문제: 에이전트가 턴 동안 문서·선택을 읽고 `editor.exec`로
편집하므로, 동시 사용자 편집은 (a) 에이전트 작업 스냅샷을 stale로 만들고 (b) 히스토리
트랜잭션을 충돌시킨다.

## Decision

`status === "streaming"` 동안 **경계(boundary)-레벨 레이어드 락**을 켠다. Aku 패널/런처
(z-48, body 형제)만 예외:

### D1 — 스크림 오버레이 (포인터 + 시각)
body portal, **z-47**(Aku z-48 바로 아래), 풀뷰포트 반투명 dim(`var(--bg)/45` + blur) +
"아쿠가 편집 중…" 라벨(`role=status`/`aria-live`). `pointer-events:auto`로 앱 포인터/클릭을
삼킴 → 캔버스·툴바·헤더·썸네일·다른 패널 한 번에 차단(앱 컴포넌트 무수정).

### D2 — `#root`에 `inert` (포커스 + a11y)
포커스·탭순서·접근성 트리 차단(스크린리더가 얼어붙은 앱을 못 헤맴). 포커스가 캔버스에
있었다면 inert가 blur → body로 이동 → D3가 처리.

### D3 — window capture 가드 (키보드 + 휠)
`keydown`/`keyup`/`wheel`을 **capture 페이즈**로 가로채, target이 Aku 표면
(`[data-aku-panel],[data-aku-launcher]`) 밖이면 `stopImmediatePropagation()`+`preventDefault()`.
→ 입력버스·DesignPage window 리스너·전역 단축키·휠줌을 **중앙에서** 차단(에디터 코드 무수정).
패널 내부 키는 통과(기존 컴포저 가드가 이미 캔버스 단축키 누수를 막음 — aku-chat e2e 보증).

### D4 — 범위 = 턴 전체(streaming), 안전 해제
정합성 위해 thinking→정리까지 막음. 락은 `status`만 추종 → done/error/abort → idle →
**자동 해제**(무한 락 없음). **중지(Stop)는 항상 가능**(패널 예외)이라 취소 가능. 에이전트의
**프로그램적 편집(`editor.exec`)은 차단 대상 아님**(사용자 입력만 막음).

### D5 — Design System Triage = escape (feature-local)
앱 특화 Aku 락이라 `features/aku/`에 둠(단일 소비자). DS 토큰 사용(`var(--bg)`/radius/shadow).
재사용 신호 시 `InteractionScrim` 프리미티브로 승격(추후 triage).

## Consequences

- (+) 포인터·키보드·휠·포커스·a11y 모두 차단, 앱/에디터 코드 거의 무수정(경계 레벨).
- (+) 동시 편집 충돌 방지(정합성). Stop 상시 가능, 자동 해제.
- (−) 알려진 한계: 락 시작 시 이미 열려 있던 body-portal 모달/메뉴(Dialog z-50, 설정 메뉴
  z-60)는 스크림 위에 있어 포인터가 닿을 수 있음(스트리밍은 보통 컴포저에서 시작 → 드묾).
  필요 시 D3 예외 셀렉터 확장.
- (−) `wheel`/단축키 capture 차단은 스트리밍 중 일부 브라우저 기본동작(스페이스 스크롤 등)도
  막음 — 짧은 구간이라 수용.
