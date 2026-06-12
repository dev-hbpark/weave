# WI-208 — Aku 패널 2-토글(provider × transport) + openai-api 모드 클라 노출

- **Status:** Done · **DR:** DR-133 · **From:** HANDOFF-030 (small-think) · **Relates:** WI-175/176/204, small-think WI-056/DR-070

## Problem

small-think openai-api 모드 추가로 모드 = provider×transport 2×2. 운영자: OpenAI 키 모드 선택 +
모드 선택을 설정 드롭다운→패널 상시 노출 + provider/transport 분리 토글.

## Change

- `agent-mode.ts`: `openai-api` 추가; `AkuProvider`/`AkuTransport` + `AXIS_TO_MODE`/`MODE_TO_AXIS`
  데이터 테이블 + `modeFromAxes`/`axesFromMode`; `connectModeOptions(mode, AkuApiKeys{anthropic,
  openai})` — transport=API일 때만 provider 키 탑재.
- `use-aku-agent.ts`: 두 키를 env에서(`VITE_AKU_API_KEY`/`VITE_AKU_OPENAI_API_KEY`) → keys 객체.
- `AkuModeBar.tsx`(신규): 헤더 아래 상시 2 세그먼트(엔진[Claude|GPT]·연결[API|SSH]).
- `AkuPanel.tsx`: hasToken 시 AkuModeBar 렌더.
- `AkuSettingsMenu.tsx`: 3-세그먼트 모드 블록 + 관련 props 제거(decommission).
- `agent-mode.test.ts`: 새 시그니처/축 테스트로 갱신.

## Acceptance

- 2-토글 패널 노출 + 4모드 매핑 + provider별 키 분리. ✔
- agent-mode 16 + aku 240 테스트 그린, tsc·biome 클린. ✔
- 라이브 시각 확인 + 서버 allowlist에 openai-api 추가 후 실연결. ☐(운영)

## Links

- DR-133 · HANDOFF-030 · HANDOFF-031 · small-think WI-056/DR-070
