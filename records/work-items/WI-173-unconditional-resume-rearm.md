# WI-173 — 재접속 adopt 재무장 무조건화 (WI-171 보완)

- Status: DONE (2026-06-11)
- Origin: 사용자 재테스트 "프레젠테이션 모드는 여전히 안되고있어" —
  진짜 원인은 small-think WI-039(abort 응답 프레임 억제)로 서버측 수정;
  본 WI는 weave측 잔여 취약점의 보완.
- Related: WI-151(adopt), WI-171(catch-경로 브리지), small-think WI-038/039

## 문제

`use-aku-agent.ts` runTurn catch의 WI-171 재무장이
`if (mayResume) engagedRef.current = false`로 **마지막 큐 뷰에 own job이
보일 때만** 발화했다. 터미널 연결 상태(error/closed)는 큐 뷰를 의도적으로
지우므로(WI-171의 다른 절반), 뷰가 지워진 직후 catch가 돌면 mayResume이
false → `engagedRef`가 true로 고착 → 이후 재접속해 서버가 리플레이한
own job이 푸시돼도 `decideResume`의 engaged 게이트가 adopt를 영구 차단 —
리플레이가 딤/로밍 없이 편집한다.

## Fix

재무장을 무조건화: catch에서 항상 `engagedRef.current = false`.
`mayResume`은 말풍선 문구 선택용으로만 잔존. 안전 근거 — 오탐 adopt는
own job 없이는 불가능하다: pure `decideResume`은 큐가 실제로 own job을
나열할 때만 adopt하고, 첫-연결 실패/Stop은 own job을 만들지 않는다.

## 검증

- `use-aku-agent.resume-bridge.test.ts` 소스-적합성 단언을 새 계약으로
  갱신 (mayResume 산출 + 무조건 재무장 + 옛 조건부 패턴 부재).
- aku 스위트 179/179 green, tsc clean, biome clean(터치 범위).

## 잔여

- 본 수정의 주 시나리오(순간 끊김)는 WI-039 이후 catch에 도달하지 않고
  pending 생존으로 streaming이 연속된다 — 본 재무장은 진짜 reject 경로
  (연결 실패 throw 등) 전용 보험.
