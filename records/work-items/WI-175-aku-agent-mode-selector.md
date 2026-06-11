# WI-175 — Aku 서버 실행-모드 전환 (api / byo-apikey / byo-ssh)

- Status: DONE (2026-06-11)
- Origin: 사용자 — "서버 동작방식을 byo-api, api를 각각 테스트하고싶은데
  클라이언트에서 선택하는것도 가능할까?" + 후속 지시 "키는 미리 서버에
  설정해둘거야. 클라이언트는 설정에서 세가지 모드를 전환할수만 있으면 돼."
- Related: small-think WI-042 (hello.mode + SMALL_THINK_ALLOWED_MODES),
  agocraft WI-039 (apiKey/mode 포워딩), DR-054 (byo-apikey 무료 호스팅 경로)
- Chain: small-think `2214b91` → agocraft `3ab173c` → weave re-vendor
  (client 0.1.6 + agent-client 1.0.0-rc.20260611161000) → 본 WI

## 설계

**키는 UI 입력이 아니다** (운영자 결정 — 첫 설계의 sessionStorage 키 입력 UI는
같은 변경 안에서 decommission). 클라이언트는 모드 전환만 한다:

1. **`agent/agent-mode.ts`** (순수 모듈):
   - `AkuAgentMode = "server" | "api" | "byo-apikey" | "byo-ssh"` —
     `"server"` = hello 에 모드 미포함(부팅 모드 그대로), 첫 선택 전 기본값.
   - `loadAgentMode`/`saveAgentMode` — localStorage `weave.aku.agent-mode`,
     검증 통과 값만 (낡은/오염 값이 클라이언트를 잠그면 안 됨 → "server").
   - `MODE_CONNECT_OPTIONS` 레지스트리 (Rule 6) → `connectModeOptions(mode, key)`:
     api/byo-ssh 는 mode 만(자격은 서버 쪽), **byo-apikey 만 키를 실음**(최소
     노출 — 키 노출의 단일 결정 지점).
2. **키 주입 = `VITE_AKU_API_KEY`** (weave `.env`, `VITE_AKU_AGENT_TOKEN` 과
   같은 패턴). 서버의 byo-apikey 는 hello.apiKey 필수·폴백 없음
   (small-think server-agent-session.ts resolveProvider) — 그래서 "서버에 미리
   설정"의 실체는 weave 쪽 env 다. 키 원문은 훅 밖으로 절대 안 나간다.
3. **`use-aku-agent.ts`**: `agentMode` 는 token 과 같은 훅-소유 반응형 상태
   (AkuSettings 아님 — 그쪽은 submit 시 비반응 읽기). `setAgentMode` 는
   setToken 패턴 — persist → `dropLink()` → setState → connect-on-init 이펙트가
   새 hello 로 재접속. `getHandle` deps 에 `agentMode, apiKey` 추가,
   connect 옵션에 `...connectModeOptions(agentMode, apiKey)`.
4. **UI**: AkuSettingsMenu "서버 모드" 세그먼트 컨트롤(3버튼, 기존
   intentSource/creativity 패턴 재사용 — Design System Triage: reuse, 신규
   프리미티브/토큰 없음). 승인 여부는 가정하지 않음 — 실제 적용 모드는
   `AkuServerInfoChip`(serverInfo.mode) 이 그대로 표시.

## Verification

- `agent-mode.test.ts` 10건: connectModeOptions 진리표(서버=빈객체·키는
  byo-apikey 만·옵션 커버리지) + localStorage 왕복/오염값 거부 +
  소스-적합성 4건(connect 스프레드 / getHandle deps / setToken 패턴 /
  env 키·시크릿 비반환) — WI-171/174 `?raw` 선례.
- aku 스코프 vitest 26 파일 205 green, `tsc --noEmit` 0,
  biome 터치 파일 clean, 루트 5게이트(tokencheck/declarativecheck/
  puritycheck/inheritancecheck/modeboundarycheck) 전부 OK.

## 운영 메모

- 서버: `SMALL_THINK_ALLOWED_MODES=api,byo-apikey,byo-ssh` (부팅 모드는 암묵
  허용; `api` 등재 = 공유 키 과금 허용을 운영자가 명시 선택하는 것).
- weave dev: vendored dep 교체라 **vite 재시작 필수**.
- `api`/`byo-apikey` 실동작에는 Console 키(`sk-ant-api03-`) 필요 — 구독
  OAuth 토큰(`sk-ant-oat01-`)은 Messages API 401 (DR-054).
