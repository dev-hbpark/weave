# WI-151 — 아쿠 재연결/새로고침 시 딤·로밍 자동 재개 (중지 안 한 런 유지)

Status: **Done** (코드/단위 검증 완료 · 실제 disconnect/refresh 캔버스 E2E 권장)
Owner: hbpark
Updated: 2026-06-09
관련: [DR-109](../decisions/DR-109-aku-resume-dim-roaming-on-reconnect.md) ·
기반 [small-think WI-034](../../small-think/records/work-items/WI-034-concurrency-queue-and-grace-reconnect.md)(60s grace-reconnect + 중단된 런 재실행 + queueStatus) ·
선례 DR-011(서버측 cancel), DR-010(연결 수명주기)

## Problem (사용자 요청)

아쿠 에이전트가 작업 도중 **서버 연결이 일시적으로 끊겼다 재연결**되거나, **브라우저를 새로고침**했을 때,
**사용자가 중지(Stop) 버튼을 누르지 않았다면** 작업 진행이 유지되어야 한다. 재연결되면 **디자인 딤처리와
로밍 동작이 자동으로 이어져야** 한다.

## 현황 진단 (탐색 결과)

- 딤(`AkuInteractionLock`)과 로밍(`useAkuRoam`)은 **단 하나의 로컬 불리언** `status === "streaming"`
  (`useAkuAgent`)에만 게이팅된다.
- **라이브 소켓 재연결(새로고침 아님)**: `status`가 메모리에 살아있고 클라이언트 라이브러리가 pending 런을
  재전송하므로 딤·로밍이 그대로 유지된다 → **이미 동작, 손댈 것 없음.**
- **브라우저 새로고침**: `status`가 `"idle"`로 리셋된다. 서버는 grace 윈도(60s) 동안 중단된 런을 잡아두고
  재연결 시 **현재 문서 스냅샷에서 재실행**하므로 문서 편집은 이어지지만, 클라이언트가 `status`를 다시
  `"streaming"`으로 되돌리지 않아 **딤·로밍이 꺼진 채 남는다** → 이게 갭.
- **중지 vs 끊김은 이미 서버 권위로 구분됨**: Stop은 cancel 프레임 → 서버가 요청을 `inflight`에서 삭제
  → grace/replay 없음. 단순 끊김은 요청을 잡아두고 60s 내 replay. 즉 **"사용자가 중지 안 함" =
  "서버가 이 clientId의 own job을 여전히 보고함"**.
- 서버는 새 클라이언트에 `queueStatus`를 푸시: `jobs` = 이 클라이언트의 own in-flight(running+queued).
  weave는 이미 `onQueueStatus`로 받지만(`use-aku-agent.ts:482`) 큐 칩 표시에만 쓰고 `status`로 매핑하지 않음.

## 결정 (요약 — 상세 DR-109)

`queueStatus.jobs`(서버 권위)를 딤·로밍 게이트로 환원한다. 새 페이지 세션에서 아직 사용자가 에이전트를
조작하지 않았는데(`engaged === false`) own job이 있으면 = **이전 세션이 시작했고 서버가 재개한 orphan 런** →
`status`를 `"streaming"`으로 **ADOPT**(기존 단일 게이트로 딤·로밍 자동 점등). 그 job이 큐에서 사라지면
(완료/취소/grace 만료) **RELEASE**(idle 복귀). **로컬 런은 `engaged`를 세팅**하므로 runTurn 수명주기가
소유 → 여기서 adopt/release 안 함(끝난 로컬 런의 꼬리를 orphan으로 오인하지 않음). 결정은 순수 함수
`decideResume`로 분리해 단위 테스트.

## 변경 (touch points)

- **신규** `apps/web/src/features/aku/agent/agent-resume.ts`
  - 순수 `decideResume({ ownJobCount, status, engaged, resumed }) → "adopt" | "release" | "none"`.
- **수정** `apps/web/src/features/aku/agent/use-aku-agent.ts`
  - refs 추가: `engagedRef`(submit/stop/clear 시 true), `resumedRef`(adopt된 런 보유), `queueStatusRef`(미러).
  - `runTurn` 스트리밍 진입에서 `engagedRef.current = true`.
  - connect-on-init 효과 뒤에 **adopt/release useEffect**(deps: `[queueStatus, status]`) — `decideResume`로 분기.
  - `stop()`: 로컬 task id가 없고 adopt된 런이면 `queueStatusRef.jobs[].id`로 서버 cancel; `resumedRef=false`,
    `engagedRef=true`(재adopt 차단).
  - `clear()`: `resumedRef=false`, `engagedRef=true`.
- **신규(테스트)** `apps/web/src/features/aku/agent/agent-resume.test.ts` — 9케이스(adopt/release/no-op 경계).

소비 컴포넌트(`AkuInteractionLock`, `useAkuRoam`, `useAkuFrameCamera`, 런처)는 **무변경** — 모두 기존
`status === "streaming"`을 읽고, adopt가 그 게이트를 세팅한다.

## 검증

- `npx vitest run src/features/aku` → 161 passed(신규 9 포함). 타입체크 0 에러. biome 클린.
- **남은 확인(권장 E2E)**: 실제 (a) 소켓 drop→reconnect, (b) 브라우저 refresh 중 런 진행 시 딤·로밍이
  자동 재개되는지, (c) Stop 후 refresh면 재개되지 않는지 캔버스에서 관찰(Continuous Self-Verification).
  no-network 샌드박스에서 라이브 에이전트 E2E는 제약([weave theme typography] 메모 참조).

## 범위/한계 (후속)

- 본 작업은 사용자가 요청한 **딤·로밍 재개**에 한정. 새로고침 후 **채팅 버블의 스트리밍 텍스트 재부착**은
  하지 않음(클라이언트 브리지에 run 재부착 API가 없음 — small-think WI-034의 out-of-scope 후속). 딤 안의
  "아쿠가 편집 중…" 필 + 로밍 마스코트로 "작업 중" affordance는 제공됨.
- 진정한 mid-flight 이벤트 replay(서버 이벤트 버퍼)는 small-think 측 후속(HANDOFF 후보).
