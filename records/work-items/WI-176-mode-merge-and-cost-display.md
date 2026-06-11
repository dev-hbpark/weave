# WI-176 — 모드 세그먼트 2개로 축소(API/SSH) + 응답 비용 표시

- Status: DONE (2026-06-11)
- Origin: 사용자 — "byo-apikey 와 api는 하나로 통합하는게 낫겠어 그리고 하나의
  명령을 완전히 수행했을때까지의 사용한 비용도 확인이 가능할까?"
- Decision: DR-116
- Upstream: small-think WI-043/DR-057 (모드 통합), WI-044/DR-058 (`cost` 이벤트)
- Builds on: WI-175 (모드 셀렉터)

## 변경

### (a) 모드 통합 — 세그먼트 3 → 2 (API / SSH)

- `agent/agent-mode.ts`: `AkuAgentMode` 에서 `"byo-apikey"` 제거;
  `AKU_AGENT_MODE_OPTIONS` 2개(API/SSH — UI 는 데이터-드리븐이라 자동 반영);
  `MODE_ALIASES` 데이터 맵으로 저장된 `"byo-apikey"` → `"api"` 마이그레이션;
  `MODE_CONNECT_OPTIONS.api` 가 키 설정 시 apiKey 를 hello 에 싣는다
  (DR-057: hello 키 = 연결별 keySource:"client", 없으면 서버 공유 키).
- `AkuSettingsMenu.tsx`: 하단 힌트 문구를 통합 의미로 갱신.
- `use-aku-agent.ts`: 모드/키 주석 갱신 (byo-apikey 언급 제거).

### (b) 태스크 비용 표시

- `agent/cost-event.ts` (신규): `costFromEvent(unknown)` — 서버의 additive
  `cost` 이벤트를 형태 검증으로 좁힌다 (벤더링된 0.1.6 `TaskEvent` 유니온이
  모르는 타입 → 닫힌 유니온 비교 대신 unknown 내로잉, 재-vendor 불필요);
  `formatTokens` / `formatUsd` / `formatCostLine` / `describeCostDetail`.
- `types.ts`: `AkuCostRecord` + `AkuAssistantMessage.cost?` (영속 유지 —
  비용은 라이브-온리가 아니라 턴의 사실; `lighten` 이 벗기지 않음).
- `use-aku-agent.ts`: runTurn onEvent + orphan(WI-174 입양 런) 핸들러 양쪽에서
  cost 이벤트를 버블에 폴드.
- `MessageList.tsx`: 버블 푸터 `data-aku-cost` — "입력 58k · 출력 3.4k 토큰 ·
  $0.0345", hover title 에 캐시 분해 + api 추정치 캐비앗.

## Verification

- `agent-mode.test.ts` 갱신 12 green (api 키 탑재 / byo-ssh 키 미탑재 /
  세그먼트 정확히 2개 / byo-apikey → api 마이그레이션).
- `cost-event.test.ts` 신규 12 green (내로잉 진리표, costUsd 옵셔널 — 가짜 0
  금지, 포맷, 훅 양 경로 source-fitness).
- apps/web vitest 108 파일 / 1114 green; tsc/biome clean.
- 루트 게이트 5종 green (tokencheck / declarativecheck / puritycheck /
  inheritancecheck / modeboundarycheck).
