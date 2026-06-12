# WI-204 — Aku 모드 셀렉터 3-세그먼트화 (codex-ssh 노출)

- 상태: DONE (2026-06-12)
- 출처: small-think WI-052/DR-066 다운스트림 — 세 번째 실행 모드 `codex-ssh`
  (운영자 ChatGPT 구독 `codex app-server`)가 서버에 추가됨. weave 후속으로
  WI-052 § 후속에 명시된 항목.
- 관련: WI-175/176/177/178/179 (모드 선택 + 비용 푸터 + 구독 윈도우 %),
  small-think DR-057(모드 통합)/DR-058(cost 이벤트)/DR-059(윈도우)/DR-066(codex)

## 변경

`agent-mode.ts`가 단일 레지스트리(Rule 6)라 추가 지점은 정확히 세 곳:

1. `AkuAgentMode` 유니온에 `"codex-ssh"`.
2. `AKU_AGENT_MODE_OPTIONS`에 세그먼트 `{ value: "codex-ssh", label: "Codex" }`
   — 설정 메뉴(`AkuSettingsMenu`)는 이 배열을 그대로 렌더하므로 JSX 무변경
   (하단 힌트 문구만 Codex 설명 추가).
3. `MODE_CONNECT_OPTIONS["codex-ssh"]` = `() => ({ mode: "codex-ssh" })` —
   byo-ssh와 동일하게 키를 싣지 않는다(자격은 서버 쪽 ChatGPT 구독).

## 비용 푸터 확인 (코드 무변경 — 주석만 갱신)

- `costFromEvent`는 `costUsd` 부재 시 토큰-온리로 자연 강등 — codex-ssh의
  토큰-only cost 이벤트(small-think DR-066 §6, 구독엔 단가 없음)가 그대로 탄다.
- 구독 윈도우 %: codex 서버가 같은 `five_hour`/`seven_day` id로 매핑해 보내므로
  기존 라벨("Session"/"주간")·정렬·taskDelta "(+n%)" 전부 재사용. 미지 id
  (`codex_<mins>m`)는 원문 표기 폴백(기존 onUnknown 방어).
- 헤더 칩(`AkuServerInfoChip`)은 `serverInfo.mode`를 그대로 표시 — 무변경.

## 승인 모델 (WI-175 원칙 유지)

세그먼트는 *요청*일 뿐: 서버 `SMALL_THINK_ALLOWED_MODES`에 `codex-ssh`가 없으면
거부 → 부팅 모드 폴백 → 실제 모드가 헤더 칩에 표시된다. 기본값
(`DEFAULT_AGENT_MODE`)은 byo-ssh 유지(WI-178 운영 결정 무변경).

## SVL

- 단위: agent-mode 13 green (codex-ssh 연결옵션 + 라운드트립 + 세그먼트 3종
  레지스트리 커버리지), cost-event 23 green (무변경 확인).
- `pnpm verify`: lint/typecheck/test/build green. e2e는 448 passed + 38
  타임아웃 실패 — 전부 `page.waitForLoadState("networkidle")` 시그니처
  (helpers.ts:128, 기록된 vite vendored-엔진 @fs 미응답 이슈). clean-main
  워크트리 베이스라인(678f019)에서 동일 spec(text-item V-Align/textOverflow ·
  theme-overlay-chrome:45 · toolbar-overflow:21 등) 동일 실패 재현 — 본 변경과
  무관한 선재 환경 조건으로 판정(WI-153 "전체 스위트 green은 기준선 아님").
- 라이브 패리티(서버 codex-ssh 승인 + 실제 태스크)는 운영 박스에 codex 설치 후
  (small-think WI-052 § 후속 Oracle runbook) 별도 확인.

## 동반 수정 (선재 lint 적자 — 별도 커밋)

main이 `pnpm lint` 적색 상태였다(본 변경과 무관): e2e 4개 spec의
`noNonNullAssertion`(파일헤더 ignore-all 관례 누락 — fontsize-reparent /
layout-css-parity / layout-css-parity-extensions / layout-extensions-command-path)
+ agent-surface.ts/test 등 `useLiteralKeys`/`useOptionalChain` FIXABLE.
관례 헤더 추가 + biome --write로 청산해 verify 게이트를 선복구.

단, `pieces/agent-surface.ts`의 literal-key 정리는 동시 세션의 WI-205/DR-130
(에이전트 툴-표면 축소) 변경과 같은 파일에 얽혀 있어 본 커밋에서 제외 —
해당 파일의 biome 정리는 WI-205 커밋에 함께 실린다(working tree에는 이미 적용됨).
