# WI-171 — 순간 끊김 재접속 시 딤·로밍 이어짐 (WI-151 adoption 브리지)

- Status: DONE (2026-06-11)
- Origin: 사용자 요청 — "이때(끊김 재접속 컨티뉴에이션) 아쿠의 로밍 동작도
  편집화면의 딤처리도 잘 이어져야 해"
- Related: WI-151/DR-109(refresh 후 adopt), WI-034(grace 재실행),
  small-think WI-037(서버 컨티뉴에이션 노트 — 같은 사용자 시나리오의 서버 측)

## 진단

딤(AkuInteractionLock)과 로밍(useAkuRoam)은 단일 게이트 `status === "streaming"`.
순간 끊김 시나리오 분기:

- 라이브 소켓이 자체 재연결로 submit 약속이 살아남으면 → status 유지, 문제 없음.
- **submit이 transport 실패로 reject되면** → runTurn catch → finally
  `setStatus("idle")` → 딤·로밍 OFF. 서버는 grace로 런을 재실행하고 편집이
  계속 흘러들어오지만, **로컬 런이 `engagedRef=true`를 세웠으므로 WI-151
  adoption이 막혀** 다시 켜지지 않는다. (WI-151은 refresh(engaged=false)만
  커버 — engaged 가드는 "방금 끝난 로컬 런의 꼬리를 orphan으로 오인해 딤이
  깜빡이는" 레이스 방지용.)

## Fix — 실패 원인으로 가드를 풀어 기존 adopt 경로 재사용

1. **catch에서 조건부 재무장**: 마지막 큐 뷰(`queueStatusRef`)에 own job이
   있을 때만(= 끊김 시점에 런이 서버에 살아 있었음) `engagedRef=false`.
   직후 status가 idle로 떨어지면 WI-151 resume 이펙트가 **그 stale 큐 뷰로
   즉시 adopt** → 딤·로밍이 거의 끊김 없이 이어짐; 재접속 시 서버 initial
   push가 재실행 잡을 다시 보여 유지, 종료 시 release. first-dial 실패(own
   job 없음)는 재무장 안 함 → 꼬리-오인 레이스 차단 유지.
   에러 버블 문구도 분기: 재개 예상 시 "재연결되면 중단된 작업을 이어서
   진행해요" (error 플래그는 유지 — grace 만료 대비 재시도 어포던스).
2. **터미널 상태에서 큐 뷰 무효화**: onStateChange에서 `error`/`closed` 시
   `setQueueStatus(null)` → adopted 상태가 release되어 죽은 링크에 딤이
   영구히 걸리는 일이 없다. `reconnecting`은 비-터미널 — stale 뷰가 곧
   브리지의 재료이므로 유지.

## 검증

- `use-aku-agent.resume-bridge.test.ts` (소스-fitness 2건; DR-030 deps-guard
  선례 — 훅 내부 장수 콜백이라 renderHook 불가, adopt/release 판정 자체는
  agent-resume.test.ts의 순수 decideResume이 커버).
- vitest 전체 1062 green, tsc clean, 5게이트 green.

## 잔여 (수용)

- adopt된 재실행 런은 로컬 task id가 없어 채팅 버블에 진행/완료가 패치되지
  않음(WI-151 기존 수용 잔여와 동일). 버블은 "이어서 진행" 안내로 남고
  딤·로밍·문서 편집이 실제 진행을 보여준다.
- 재개 안내 버블의 error 플래그로 재시도 버튼이 남음 — 재실행이 이미 완료된
  뒤 재시도하면 중복 실행 가능(기존에도 동일 노출; 서버 WI-037 노트가 중복
  생성은 완화).
