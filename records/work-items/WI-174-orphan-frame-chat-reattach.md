# WI-174 — 채팅 패널의 그레이스-리플레이 런 재부착 (고아 프레임 브리지)

- Status: DONE (2026-06-11)
- Origin: 사용자 — "채팅 패널도 다시연결될수있도록 개선해". 새로고침 후
  딤/로밍은 WI-151/171/173 + small-think WI-038~040으로 복구되지만, 채팅
  패널은 리플레이된 런의 진행 스트리밍도 최종 응답도 표시하지 못했다.
- Related: weave WI-151(adopt/release), WI-171/173(재무장 브리지),
  small-think WI-041(SDK 고아 훅), agocraft WI-038(deps 포워딩)

## 근본 원인

`@small-think/client`의 pending 맵은 메모리 전용 — 새로고침이 지우면
서버가 리플레이한 런의 task 프레임(id에 대응하는 pending 없음)은 SDK가
조용히 드롭했다. 큐 own-job 푸시(딤/로밍 경로)와 달리 채팅 UI가 붙을
채널 자체가 없었다.

## 체인 (4 레이어)

1. small-think client 0.1.5 (WI-041): `onOrphanEvent` / `onOrphanResponse`
2. agocraft agent-client rc.20260611152500 (WI-038): deps 포워딩
3. weave re-vendor: client 0.1.5(override 2곳) + agent-client rc(3곳)
4. **본 WI** — `use-aku-agent.ts` 소비 + 순수 모듈 `orphan-turn.ts`

## 설계 (orphan-turn.ts = 순수 절반)

- **게이트** `shouldHandleOrphanFrame({engaged, resumed})`: `engaged &&
  !resumed`면 드롭 — stop/clear 후 서버측 완료가 늦게 보낸 ok 프레임
  (WI-039가 ok는 유지)을 차단. 신선한 페이지 세션(engaged=false)은
  adopt 푸시보다 프레임이 먼저 와도 수용.
- **버블 plan** `planAdoptedBubble(last, now)`: persist된 트랜스크립트는
  중단된 턴의 assistant 버블로 끝남(runTurn이 user+assistant 동시 커밋;
  `lighten()`이 activity는 이미 제거) → **revive** (캡션 "이어서 작업
  중…" + WI-171 에러 플래그 해제). 트레일링 assistant 없으면 append.
- **칩 병합** `mergeOrphanEdits`: 드롭 전 persist된 칩 뒤에 리플레이
  스트림의 칩을 덧붙임 — 같은 논리 턴의 이전 편집을 덮어쓰지 않음.
- **finalize** `finalizeOrphanResponse`: runTurn 응답 경로 미러 —
  스트리밍 프로즈 우선, 없으면 `finalText || "완료했어요."`(`||`라
  빈 finalText도 확인 문구), 실패면 에러 텍스트+플래그; 캡션 제거,
  성공 시 stale 에러 플래그 해제.

## 훅 와이어링 (use-aku-agent.ts)

- 핸들러는 **ref에 매 렌더 재할당** (depsRef 패턴) — connect 옵션은
  ref만 클로즈, 재연결에도 신선한 클로저로 라우팅.
- 고아 이벤트: `reduceAgentState` 폴드(orphanRunStateRef) → message
  프로즈 append → `activityFor` 캡션 + 칩 — runTurn onEvent 미러.
- adopt(decideResume) → `attachAdoptedBubble()`(멱등); release →
  잔여 캡션 제거 + 폴드 리셋 (응답 없이 취소/만료된 런의 폴백).
- stop()/clear()도 폴드 리셋 (이후 프레임은 게이트가 차단).
- `patchLastAssistant`를 getHandle 앞으로 이동 (effect/핸들러 어순).

## Verification

- 신규: `orphan-turn.test.ts` 12건 (게이트 진리표 / revive·append /
  칩 병합 / finalize 매트릭스) + `use-aku-agent.orphan-bridge.test.ts`
  4건 (소스-적합성 — WI-171 resume-bridge 선례).
- aku 스위트 195/195, **전체 vitest 1090/1090 green**, tsc clean,
  biome(터치 범위) clean, 루트 5게이트(token/declarative/purity/
  inheritance/modeboundary) green.
- 라이브 확인 절차: vite dev 재시작(vendored dep 교체) 후 에이전트
  편집 중 새로고침 → 채팅 버블이 "이어서 작업 중…" → 진행 캡션/칩
  스트리밍 → 최종 응답 텍스트로 마무리되는지.

## 한계 / 메모

- 리플레이 런의 `intent` 이벤트는 채택하지 않음 (persist된 칩 유지) —
  필요해지면 orphan 핸들러에 한 줄 추가.
- adopt 시 트레일링 assistant가 "이미 완료된 옛 턴"인 코너는 이론상
  존재하나, 컴포저가 streaming 중 send를 막아 클라이언트당 in-flight
  1턴이므로 실사용 경로에서는 발생하지 않음.
