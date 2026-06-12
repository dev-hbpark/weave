# HANDOFF-030 — (from small-think) openai-api 모드 준비 완료 → weave 패널 2-토글(provider×transport) UI

- **From:** small-think · **To:** weave · **Date:** 2026-06-13 · **Status:** Server Ready (weave UI 대기)
- **small-think:** WI-056 / DR-070

## 무엇이 준비됐나 (서버)

신규 실행 모드 **`openai-api`**(OpenAI API 키로 in-process agent loop). 모드 매트릭스:

| | transport=API | transport=SSH |
|---|---|---|
| provider=Anthropic | `api` | `byo-ssh` |
| provider=OpenAI | **`openai-api`** (신규) | `codex-ssh` |

- 클라가 ctl hello `mode:"openai-api"` 요청 + (선택) `apiKey`(OpenAI 키, per-conn 승; 없으면 서버
  `OPENAI_API_KEY`). 서버가 `SMALL_THINK_ALLOWED_MODES`에 `openai-api` 있을 때 grant.
- serverInfo.mode = `"openai-api"`, serverInfo.model = OpenAI 모델(기본 gpt-5.1). keySource 동일.
- cost 이벤트 동일 발행(gpt-* 비용표). 구독 윈도우(5h/주간)는 없음(API 토큰과금).

## weave 측 요청 액션 (UI 재구성)

운영자 요구: **모드 선택을 설정 드롭다운에서 꺼내 패널에 노출**, 그리고 **provider × transport
2-토글**로.

1. **모드 모델 재구성** (`features/aku/agent/agent-mode.ts`): 현재 flat enum
   (`server|api|byo-ssh|codex-ssh`)을 **2축(provider: anthropic|openai, transport: api|ssh)**으로
   표현하고 4개 모드 문자열로 매핑:
   - (anthropic, api)→`api` · (anthropic, ssh)→`byo-ssh` · (openai, api)→`openai-api` ·
     (openai, ssh)→`codex-ssh`.
   - `connectModeOptions`는 그대로 `{ mode, apiKey? }` 생성. **apiKey는 선택된 provider에 따라
     OpenAI/Anthropic 키**: Anthropic은 기존 `VITE_AKU_API_KEY`, OpenAI는 신규 env(`VITE_AKU_
     OPENAI_API_KEY` 권장). 선택 provider가 openai면 OpenAI 키를 hello.apiKey로.
2. **패널 노출 UI**: 설정 메뉴(`AkuSettingsMenu.tsx`)의 3-세그먼트 대신, **Aku 패널 헤더에 2개
   토글 행** — [Anthropic | OpenAI] + [API | SSH]. 선택 즉시 재연결(기존 onSetAgentMode 흐름). 서버
   allowlist에 없으면 서버가 boot 모드로 fallback하고 serverInfo로 실제 모드 표시(기존 동작) — 토글이
   "요청"이고 칩이 "실제"임을 유지.
3. **localStorage** 키는 기존 `weave.aku.agent-mode`(4-모드 문자열)로 호환 — 2축은 그 문자열에서
   파생(파생 함수 1개), 별도 저장 불필요.
4. 표시: 헤더 칩(`AkuServerInfoChip.tsx`)은 그대로 serverInfo.mode/model 렌더 — `openai-api`·
   gpt-5.1이 자연히 표시됨.

## 주의

- 4개 조합 중 서버가 allow하지 않은 모드는 토글에서 비활성/요청-실패 표시 가능(서버 fallback이
   안전망이라 필수는 아님).
- OpenAI 키는 비밀: 기존 RISK-004대로 로그/DevTools 노출 금지, env에서만.

— small-think 전문: `workspace/small-think/records/decisions/DR-070-provider-transport-matrix-openai-api.md`
