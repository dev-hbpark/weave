# DR-116 — 모드 세그먼트 통합(API/SSH) + 비용 이벤트의 unknown-내로잉 수신

- **Date:** 2026-06-11 · **Status:** Accepted · **WI:** WI-176
- **Relates:** WI-175 (모드 셀렉터), small-think DR-057 (api/byo-apikey 통합),
  small-think DR-058 (`cost` 이벤트 + task-cost audit), DR-011 (additive
  이벤트 / onUnknown:"preserve")

## Context

small-think DR-057 이 서버 모드를 `api | byo-ssh` 2종으로 통합했다
(`byo-apikey` 는 영구 별칭; hello 에 apiKey 가 실리면 그 연결만 그 키 사용).
DR-058 은 태스크당 1회 additive `cost` 이벤트(전 턴 토큰 합계 + costUsd?)를
ok 응답 직전에 스트림한다. weave 클라이언트는 (1) 세그먼트 3개에 여전히
`byo-apikey` 를 노출하고 있었고, (2) 비용을 표시할 표면이 없었다.

## Decision

1. **세그먼트는 2개 (API / SSH).** `AkuAgentMode` 에서 `"byo-apikey"` 를
   제거하고, `MODE_CONNECT_OPTIONS.api` 가 **키 설정 시 apiKey 를 싣는다** —
   weave `.env` 의 `VITE_AKU_API_KEY` 존재 자체가 운영자의 opt-in 이다.
   키가 없으면 mode 만 → 서버 공유 키 (DR-057 keySource:"server").
2. **저장값 마이그레이션은 데이터 맵** (`MODE_ALIASES`, Rule 6) —
   `loadAgentMode()` 가 저장된 `"byo-apikey"` 를 `"api"` 로 승계한다.
   if-체인이 아닌 별칭 레지스트리라 다음 통합도 1행 추가다.
3. **cost 이벤트는 unknown-내로잉으로 수신, 재-vendor 하지 않는다.**
   벤더링된 클라이언트(0.1.6)의 `TaskEvent` 유니온은 `"cost"` 를 모른다 —
   닫힌 유니온과의 리터럴 비교는 TS 가 거부하고, 유니온 캐스트는 거짓 안전이다.
   대신 `costFromEvent(event: unknown)` 이 형태를 검증해 `AkuCostRecord` 로
   좁힌다. 전송 계층은 DR-011 의 onUnknown:"preserve" 계약으로 이벤트를
   불투명 통과시키므로 런타임은 이미 도달한다. 다음 re-vendor 에서 유니온이
   `cost` 를 알게 돼도 이 파서는 그대로 유효하다 (형태 동일).
4. **비용은 라이브-온리가 아니라 턴의 사실** — `AkuAssistantMessage.cost` 는
   영속된다 (`lighten` 이 벗기지 않음). activity/undo 메타와 달리 리로드 후에도
   의미가 변하지 않는다.
5. **표시는 버블 푸터 1줄** ("입력 58k · 출력 3.4k 토큰 · $0.0345") — 입력은
   캐시 읽기/쓰기 포함 총량(모델에 실제 투입된 토큰), 정확한 분해와 "api 모드
   달러는 추정치" 캐비앗은 hover title 로. `costUsd` 부재 시 달러 생략
   (DR-058: 가짜 0 금지).
6. **입양(orphan) 런도 동일 경로** — WI-174 핸들러에 같은 폴드를 미러링,
   재접속으로 이어받은 런의 비용도 표시된다.

## Consequences

- serverInfo.keySource 칩 표기는 보류 — 벤더링된 `ServerInfo` 타입에 필드가
  없어 다음 re-vendor 때 함께 싣는 것이 맞다 (캐스트-해킹 기각).
- 서버가 cost 를 안 보내는(구버전) 환경은 푸터가 그냥 안 뜬다 — 무해.
- 기존에 byo-apikey 를 저장해 둔 브라우저는 첫 로드에 api 로 승계되고,
  키가 env 에 있는 한 동작은 동일하다 (hello 키 우선, DR-057).

## Verification

- `agent-mode.test.ts` (12): api 가 키를 싣고 byo-ssh 는 안 싣는다, 세그먼트
  정확히 2개, byo-apikey → api 마이그레이션, 가비지 거부.
- `cost-event.test.ts` (12): 내로잉 진리표(타 이벤트/비유한수/문자열 거부,
  costUsd 옵셔널 강등), 포맷 진리표, 훅 양 경로 source-fitness.
- apps/web vitest 1114 green · tsc/biome clean · 루트 게이트 5종 green.
