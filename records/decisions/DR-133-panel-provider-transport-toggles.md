# DR-133 — Aku 모드 선택을 패널 노출 2-토글(provider × transport)로

- **Date:** 2026-06-13 · **Status:** Accepted · **WI:** WI-208
- **In:** HANDOFF-030 (from small-think, openai-api ready) · **Relates:** WI-175/WI-176/WI-204(모드 선택 이력), small-think WI-056/DR-070

## Context

small-think이 openai-api 모드를 추가(WI-056/DR-070)해 실행 모드가 provider(Anthropic|OpenAI) ×
transport(API|SSH) 2×2가 됨. 운영자 요구: ① OpenAI API 키 모드를 클라에서 선택 가능하게, ②
모드 선택을 **설정 드롭다운에서 꺼내 패널에 상시 노출**(쉽게 전환·확인), ③ provider/transport를
**나눠서** 고르게.

## Decision

1. **모드 모델에 2축 추가** (`agent-mode.ts`): `AkuAgentMode`에 `openai-api` 추가(4모드).
   `AkuProvider`/`AkuTransport` + 데이터 테이블 `AXIS_TO_MODE`/`MODE_TO_AXIS` + 헬퍼
   `modeFromAxes`/`axesFromMode`(Rule 6: switch 금지, 한 축 토글 시 다른 축 유지). 모드 문자열은
   wire/영속화 단위로 유지(localStorage `weave.aku.agent-mode` 호환 — "server" 레거시는 기본
   모드 축으로 표시되나 토글은 항상 구체 모드 생성).
2. **provider별 키** (`AkuApiKeys{anthropic,openai}`): `connectModeOptions(mode, keys)`가 선택
   모드의 transport=API일 때만 해당 provider 키를 hello에 실음 — api→Anthropic(VITE_AKU_API_KEY),
   openai-api→OpenAI(VITE_AKU_OPENAI_API_KEY), ssh모드→없음. 키 노출 단일 결정 지점(RISK-004,
   env opt-in, hook 반환 금지).
3. **패널 노출 UI** (`AkuModeBar.tsx`): 헤더 아래 상시 슬림 바에 2 세그먼트 그룹 —
   엔진[Claude|GPT] + 연결[API|SSH]. 선택 즉시 `onSetAgentMode(modeFromAxes(...))` → 기존 재연결
   흐름. 요청-실제 분리 유지(토글=요청, serverInfo.mode 칩=실제; allowlist 거부 시 서버 폴백).
4. **Decommission**: 설정 메뉴(`AkuSettingsMenu`)의 3-세그먼트 모드 블록 + agentMode/
   onSetAgentMode props 제거(패널로 이동, dead UI 제거).

## 트레이드오프

- (+) 2축 분리로 의도 명확 + 패널 상시 노출로 전환·검증 즉시. 모드 문자열/영속화 불변(호환).
- (+) Rule 6 데이터 테이블 — 모드/축 추가가 데이터 한 줄.
- (−) 4조합 중 서버 allowlist 미허용 모드도 토글엔 보임 — 서버 폴백 + 칩 표시가 안전망(토글
  비활성화는 미구현, 서버 상태를 클라가 선험적으로 모르므로 의도적).
- (−) OpenAI 키는 별도 env(VITE_AKU_OPENAI_API_KEY) 필요 — 운영자 설정 항목 추가.

## Verification

`agent-mode.test.ts` — connectModeOptions provider별 키 분리(api=Anthropic만, openai-api=OpenAI만,
ssh=키 없음) + 축 합성/왕복 + 한 축 토글 유지, 16 그린. aku 스위트 240 그린, `tsc --noEmit` 클린,
biome 클린. (시각 렌더는 dev 서버에서 확인 — 2 토글 헤더 아래.)

## Links

- `apps/web/src/features/aku/agent/agent-mode.ts`·`AkuModeBar.tsx`·`AkuPanel.tsx`·`AkuSettingsMenu.tsx`·`use-aku-agent.ts`
- small-think WI-056/DR-070 · HANDOFF-030 · HANDOFF-031(회신)
