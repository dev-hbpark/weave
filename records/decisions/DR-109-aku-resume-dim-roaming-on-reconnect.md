# DR-109 — 아쿠 재연결/새로고침 시 딤·로밍 자동 재개 (queueStatus 권위 + adopt/release)

- 상태: ACCEPTED
- 날짜: 2026-06-09
- 관련: WI-151 · 기반 small-think WI-034(grace-reconnect 60s + 중단 런 재실행 + queueStatus 푸시) · 선례 DR-011(서버측 cancel), DR-010(연결 수명주기)
- 무관(미변경): 딤/로밍 컴포넌트(AkuInteractionLock, useAkuRoam) — 게이트(`status==="streaming"`)는 그대로, 그 입력만 재연결 시 재환원

## 맥락

요청: 아쿠 작업 중 (a) 연결 일시 끊김→재연결, (b) 브라우저 새로고침 시, **사용자가 Stop을 누르지
않았다면** 런이 유지되고 재연결되면 **디자인 딤 + 로밍이 자동으로 이어져야** 한다.

탐색으로 확인한 사실:
- 딤·로밍은 **단일 로컬 불리언** `status === "streaming"`(`useAkuAgent`)에만 의존.
- **라이브 재연결**: `status`가 메모리에 살아있어 이미 유지됨(라이브러리가 pending 재전송). → 무손.
- **새로고침**: `status`가 `"idle"`로 초기화. 서버는 grace(60s) 동안 중단 런을 잡았다가 재연결 시 **현재 문서
  스냅샷에서 재실행**(byo-ssh 도구는 브라우저에 있어 "계속 실행"이 불가능 → 재실행이 유일한 정직한 이어가기,
  WI-034). 문서 편집은 재개되지만 **클라이언트가 `status`를 복원하지 않아 딤·로밍이 꺼진 채** 남음. ← 갭.
- **Stop vs 끊김은 서버 권위로 이미 구분**: Stop=cancel 프레임 → 서버가 요청을 `inflight`에서 삭제 →
  hold/replay 없음. 끊김=요청 유지 → replay. 따라서 **"Stop 안 함" ⇔ "서버가 이 clientId의 own job을
  여전히 보고"**.
- 서버가 새 클라이언트에 푸시하는 `queueStatus.jobs` = 이 클라이언트의 own in-flight(running+queued).
  `clientId = weave-client:<designId>`로 새로고침에도 안정. weave는 이미 `onQueueStatus`로 수신하나
  **`status`로 매핑하지 않음**(큐 칩 전용).

## 결정

1. **queueStatus를 딤·로밍 게이트로 환원(서버 권위).** 별도의 새 신호/프로토콜 없이, 이미 도착하는
   `queueStatus.jobs.length`를 사용한다. Stop된 런은 서버 `jobs`에서 빠지므로 own job 존재 == "런 활성 +
   사용자 미중지" — 요구사항과 정확히 일치.

2. **adopt/release 수명주기 분리.** 새 페이지 세션에서 사용자가 아직 에이전트를 조작하지 않았고
   (`engaged===false`) own job이 있으면, 그 job은 **이전 세션이 시작 → 서버가 재개한 orphan** →
   `status="streaming"`으로 **ADOPT**(기존 단일 게이트로 딤·로밍 점등). 그 job이 큐에서 사라지면
   **RELEASE**(idle). 결정은 순수 함수 `decideResume`:
   - ADOPT: `ownJobCount>0 && status==="idle" && !engaged && !resumed`
   - RELEASE: `resumed && ownJobCount===0`
   - 그 외 none.

3. **`engaged`로 로컬 런과 분리.** `runTurn` 진입(로컬 submit) 시 `engagedRef=true`. 이후 모든 job은 로컬
   런 수명주기(runTurn)가 소유 → adopt 비활성. 이로써 **끝난 로컬 런의 꼬리**(runTurn이 status를 idle로
   바꿨지만 queueStatus가 아직 그 job을 안 비운 찰나)를 orphan으로 **오인해 딤을 다시 켜는 일이 없다**(핵심
   오탐 방지). adopt는 결국 "새 페이지 로드에서 이전 세션 런을 1회 인수"하는 동작으로 한정된다.

4. **Stop은 adopt된 런도 중지.** adopt된 런은 로컬 task id가 없으므로, `stop()`이 `queueStatus.jobs[].id`로
   서버 cancel(기존 `handle.cancel`). 이어 `resumedRef=false`, `engagedRef=true`로 **재adopt 차단**(서버가
   취소 처리로 job을 비우기 전 효과가 다시 켜는 것 방지). `clear()`도 동일 플래그 정리.

5. **소비 컴포넌트 무변경.** AkuInteractionLock/useAkuRoam/useAkuFrameCamera/런처는 모두 기존
   `status==="streaming"`을 읽는다. adopt가 그 게이트를 세팅하므로 컴포넌트 수정 0.

## 대안 / 기각

- **localStorage에 런 마커 영속 + Stop 시 tombstone**: stop 직후 같은 틱에 새로고침해 cancel 프레임이 소켓
  flush 전 유실되는 극단 레이스를 막으려는 안. 그러나 그 레이스는 사람 조작 속도로 사실상 불가하고, stale
  마커/정리 등 표면적이 늘어 보류. 서버 권위(jobs)가 이미 "미중지"를 정확히 표현하므로 v1은 마커 불필요.
- **클라이언트 브리지에 run 재부착 API(`onRunEvent(taskId)`)/서버 이벤트 replay**: 채팅 버블 스트리밍까지
  진짜로 이어붙이는 방법. small-think WI-034가 "server-authoritative doc → true mid-flight resume"을 명시적
  out-of-scope 후속으로 둠. 본 요청(딤·로밍)에는 과함 → 후속/HANDOFF 후보.
- **연속 파생 게이트 `status || jobs>0`(adopt/release 없이)**: 단순하지만 끝난 로컬 런 꼬리에서 딤이 잠깐
  남는 글리치 + queued 처리 모호. adopt/release + engaged가 더 정확.

## 영향 / 검증

- 로컬 런 경로 무영향(engaged가 즉시 true). 새 신호/서버 변경 없음(기존 queueStatus 소비 확장).
- 단위: `agent-resume.test.ts` 9케이스 + `src/features/aku` 161 전부 green. 타입체크 0, biome 클린.
- 후속: 실제 disconnect/refresh/Stop-후-refresh 시나리오 캔버스 E2E(no-network 샌드박스 제약 유의). 채팅
  버블 재부착 + 진정한 이벤트 replay는 별도 작업.
