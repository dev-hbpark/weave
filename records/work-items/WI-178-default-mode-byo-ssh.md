# WI-178 — 클라이언트 기본 모드를 byo-ssh 로

- Status: DONE (2026-06-11)
- Origin: 사용자 — "클라이언트에서의 설정 기본값을 byo-ssh로 해줘"
- Builds on: WI-175 (모드 셀렉터 + 서버 allowlist 안전망), WI-176 (DR-057
  api|byo-ssh 통합)
- Decision inline (작은 변경 — 별도 DR 없음):

## 결정

첫 선택 전(저장값 없음 / 가비지 / localStorage 차단) 폴백을 `"server"` →
`"byo-ssh"` 로 변경. 현 배포의 일상 모드가 구독 CLI(byo-ssh)이므로 새
브라우저도 그 모드를 요청하는 것이 운영자 의도와 일치한다.

안전 근거 (WI-175 승인-불가정 원칙 그대로):

- 서버 allowlist(`SMALL_THINK_ALLOWED_MODES`)가 byo-ssh 를 거부하면 부팅
  모드로 조용히 폴백하고 `serverInfo.mode` 가 실제 적용 모드를 통보한다 —
  기본값이 바뀌어도 잘못된 모드로 실행될 수 없다.
- 명시적으로 저장된 `"server"` 선택은 그대로 존중된다 (round-trip 유지).
- byo-ssh 요청은 키를 싣지 않으므로 (자격은 전부 서버 쪽) 키 노출 면적
  변화 없음.

## 변경

- `agent/agent-mode.ts`: `DEFAULT_AGENT_MODE: AkuAgentMode = "byo-ssh"`
  상수 신설(단일 출처) + `loadAgentMode` 의 두 폴백(`"server"` 리터럴
  2곳)을 그 상수로 교체. 타입 doc 주석에 "server = 명시 저장 시에만
  동작하는 레거시/탈출구 값" 명시.
- 소비자 무변경: `use-aku-agent.ts` useState 초기화가 `loadAgentMode()` 를
  그대로 쓰므로 자동 반영; 설정 세그먼트는 SSH 가 선택된 상태로 뜬다.

## Verification

- `agent-mode.test.ts` 12 green — garbage/missing → `"byo-ssh"` 기대값 갱신
  + `DEFAULT_AGENT_MODE === "byo-ssh"` 단언; 명시 `"server"` round-trip 유지.
- aku 스위트 27 파일 / 226 green; tsc/biome clean; 루트 게이트 5종 green.
