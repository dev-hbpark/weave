# DR-110 — 전역 큐 뷰 소비: own 필터링 + 칩에 타인 작업 표시

- 상태: ACCEPTED
- 날짜: 2026-06-09
- 관련: WI-152 · 생산측 small-think WI-035/DR-056 · 보완 WI-151/DR-109(resume)

## 맥락

small-think WI-035로 `queueStatus.jobs`가 전역(모든 클라이언트 jobs; foreign는 `own:false` + `"other:N"`
익명 id)이 된다. weave는 그간 `jobs`를 "이 클라이언트 own-only"로 가정한 코드가 셋 있었다:
- `AkuQueueChip.ownJob`/tooltip: 모든 행을 "내 작업"으로 라벨, 취소는 `jobs[0]`.
- WI-151 resume `ownJobCount = jobs.length`.
- WI-151 `stop()`: adopted 런 취소를 위해 `jobs[].id` 전부 cancel.

이대로 전역 jobs를 받으면: resume가 **남의 작업에도 딤을 켜고**(false-adopt), 칩이 foreign을 "내 작업"으로
오라벨하며, stop이 foreign id(무해하지만)까지 취소 시도한다.

## 결정

1. **"내 것"을 뜻하는 모든 지점에 `j.own` 필터를 적용.**
   - resume `ownJobCount = jobs.filter(j => j.own).length` → 내 in-flight만 카운트(타인 작업은 딤 무관).
   - `stop()` adopted-cancel: `if (job.own)`만 cancel(foreign `"other:N"`은 실제 id 아님 → 절대 취소 안 함).
2. **칩은 전역 목록을 own/타인 구분 렌더.** tooltip에 전체 jobs를 own 먼저 정렬해 표시: own="내 작업"(강조)
   + 취소 버튼, foreign="다른 작업"(dim, state+position만, 취소 없음). 칩 라벨/variant는 내 작업 기준 유지.
3. **와이어 타입 무변경 → 재벤더 불필요.** `own:boolean`은 벤더된 .d.ts에 이미 존재. 구 서버(own-only,
   own:true)에서도 필터는 no-op이라 동작 동일 → 신 weave를 먼저 배포해도 안전(권장 순서).
4. **표현 분기는 ternary로.** own/foreign 행 스타일·라벨은 순수 표현이라 `j.own ? A : B`로 충분(비즈니스
   디스패치 아님 → Rule 6 대상 아님).

## 대안 / 기각

- **칩을 click Popover로 승격해 지속 모니터링 패널 제공**: UX 더 좋음(특히 큐 관찰). 그러나 이번 범위는 전역
  가시성 확보가 핵심이고 기존 Tooltip 패턴 REUSE가 최소 변경 → Popover 승격은 후속 폴리시로 분리.
- **own 필터 없이 `jobs.length` 유지**: resume false-adopt(남의 작업에 내 딤) 발생 → 기각.

## 영향 / 검증

- aku 161 테스트 green(resume 9 포함), 타입체크 0, biome 클린.
- 배포 순서: weave 먼저(또는 동시) → small-think.
- 후속: 멀티클라이언트 실배포 확인, Popover 모니터 패널.
