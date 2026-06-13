/**
 * Aku 에이전트 실행-모드 선택 (WI-175 → WI-176 — small-think WI-042/WI-043 다운스트림).
 *
 * 서버는 부팅 모드(SMALL_THINK_AGENT_MODE) 외에 hello.mode 로 연결별 모드 요청을
 * 받는다(승인은 서버의 SMALL_THINK_ALLOWED_MODES allowlist). 이 모듈은 그 요청을
 * 만드는 클라이언트 쪽 순수 절반: 모드 영속화 + connect 옵션 변환.
 *
 * small-think DR-057 이 byo-apikey 를 api 로 통합했다 — 실행 모드는 3종
 * (WI-204: codex-ssh 추가, small-think WI-052/DR-066 다운스트림):
 * - `api`: hello 에 apiKey 가 실리면 그 키(연결별, keySource:"client"), 없으면
 *   서버 공유 키(keySource:"server"). weave 는 `.env` 의 `VITE_AKU_API_KEY` 가
 *   설정돼 있을 때만 키를 싣는다 — env 설정 자체가 운영자의 opt-in 이다.
 *   키 원문은 로그·React props 로 노출하지 않는다 (RISK-004).
 * - `byo-ssh`: 자격은 전부 서버 쪽(Claude 구독 CLI) — 클라이언트는 모드만 요청.
 * - `codex-ssh`: 자격은 전부 서버 쪽(ChatGPT 구독 codex app-server) — byo-ssh 와
 *   동일하게 모드만 요청. 비용 푸터는 토큰-온리(costUsd 없음 — 구독엔 단가가
 *   없다)로 자동 강등되고, 구독 윈도우 %는 같은 five_hour/seven_day 라벨을 탄다.
 *
 * 승인 여부는 가정하지 않는다: 서버가 거부하면 부팅 모드로 폴백하고 실제 적용
 * 모드를 `serverInfo.mode` 로 통보한다 — AkuServerInfoChip 이 그대로 보여준다.
 */

/** "server" = hello 에 모드를 싣지 않음(서버 부팅 모드 그대로) — 명시적으로 저장된
 *  경우에만 동작하는 레거시/탈출구 값. 나머지 셋은 서버의 실행 모드 3종(DR-057
 *  통합 + WI-204 codex)에 대한 요청. 첫 선택 전 기본값은 DEFAULT_AGENT_MODE. */
export type AkuAgentMode = "server" | "api" | "byo-ssh" | "openai-api" | "codex-ssh";

/**
 * The 4 real modes are a provider × transport MATRIX (small-think WI-056/DR-070):
 *   (anthropic, api) → api        (anthropic, ssh) → byo-ssh
 *   (openai,    api) → openai-api (openai,    ssh) → codex-ssh
 * The panel exposes the two axes as two toggles (HANDOFF-030); the mode string
 * stays the wire/persistence unit and is composed/derived from the axes.
 */
export type AkuProvider = "anthropic" | "openai";
export type AkuTransport = "api" | "ssh";

/** 첫 선택 전(저장값 없음/가비지/localStorage 차단) 기본 모드 — 운영자 결정(WI-178):
 *  현 배포의 일상 모드가 구독 CLI(byo-ssh)이므로 새 브라우저도 그걸 요청한다.
 *  서버 allowlist 가 거부하면 부팅 모드로 폴백하고 serverInfo.mode 로 통보된다
 *  (WI-175 승인 불가정 원칙 그대로 — 기본값이 바뀌어도 안전). */
export const DEFAULT_AGENT_MODE: AkuAgentMode = "byo-ssh";

/** 실행 모드 4종 ("server" 는 선택-이전 상태). 패널 UI 는 이 flat 목록 대신 아래
 *  provider/transport 두 축 옵션을 쓴다 — 이 목록은 모드 검증/커버리지의 단일 진실. */
export const AKU_AGENT_MODE_OPTIONS: ReadonlyArray<{
  readonly value: AkuAgentMode;
  readonly label: string;
  readonly hint: string;
}> = [
  {
    value: "api",
    label: "Claude API",
    hint: "Anthropic API 키로 실행 — weave에 설정된 키(VITE_AKU_API_KEY)가 있으면 그 키, 없으면 서버 공유 키",
  },
  { value: "byo-ssh", label: "Claude SSH", hint: "서버의 Claude 구독 CLI(ssh)로 실행" },
  {
    value: "openai-api",
    label: "GPT API",
    hint: "OpenAI API 키로 실행 — weave에 설정된 키(VITE_AKU_OPENAI_API_KEY)가 있으면 그 키, 없으면 서버 공유 키",
  },
  { value: "codex-ssh", label: "GPT SSH", hint: "서버의 ChatGPT 구독 Codex(app-server)로 실행" },
];

/** 패널 2-토글 — provider 축 (Rule 6: 데이터). `disabled` = 선택 불가(현재 비활성).
 *  GPT(openai)는 현재 비활성화 — Claude만 선택 가능. */
export const AKU_PROVIDER_OPTIONS: ReadonlyArray<{
  readonly value: AkuProvider;
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
}> = [
  { value: "anthropic", label: "Claude", hint: "Anthropic (Claude)" },
  { value: "openai", label: "GPT", hint: "OpenAI (GPT) — 현재 비활성화", disabled: true },
];

/** 패널 2-토글 — transport 축 (Rule 6: 데이터). `disabled` = 선택 불가(현재 비활성).
 *  API transport는 현재 비활성화 — SSH(구독 CLI)만 선택 가능. */
export const AKU_TRANSPORT_OPTIONS: ReadonlyArray<{
  readonly value: AkuTransport;
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
}> = [
  {
    value: "api",
    label: "API",
    hint: "API 키로 실행 (설정된 연결별 키, 없으면 서버 공유 키) — 현재 비활성화",
    disabled: true,
  },
  { value: "ssh", label: "SSH", hint: "서버의 구독 CLI로 실행 (Claude CLI / ChatGPT Codex)" },
];

/** (provider, transport) → mode, 그리고 역방향 (Rule 6: 데이터 테이블, switch 금지). */
const AXIS_TO_MODE: Readonly<Record<string, Exclude<AkuAgentMode, "server">>> = {
  "anthropic:api": "api",
  "anthropic:ssh": "byo-ssh",
  "openai:api": "openai-api",
  "openai:ssh": "codex-ssh",
};
const MODE_TO_AXIS: Readonly<
  Record<AkuAgentMode, { readonly provider: AkuProvider; readonly transport: AkuTransport }>
> = {
  // "server"(선택-이전)는 표시용으로 기본 모드의 축으로 매핑 — 토글은 항상 구체 모드를 만든다.
  server: { provider: "anthropic", transport: "ssh" },
  api: { provider: "anthropic", transport: "api" },
  "byo-ssh": { provider: "anthropic", transport: "ssh" },
  "openai-api": { provider: "openai", transport: "api" },
  "codex-ssh": { provider: "openai", transport: "ssh" },
};

/** 두 축 → 모드 (한 축을 토글하면 다른 축은 현재값 유지). */
export function modeFromAxes(provider: AkuProvider, transport: AkuTransport): AkuAgentMode {
  return AXIS_TO_MODE[`${provider}:${transport}`] ?? DEFAULT_AGENT_MODE;
}

/** 모드 → 두 축 (토글 활성 표시용). */
export function axesFromMode(mode: AkuAgentMode): {
  readonly provider: AkuProvider;
  readonly transport: AkuTransport;
} {
  return MODE_TO_AXIS[mode];
}

/** 구독 모드 = SSH transport (byo-ssh / codex-ssh) — 자격이 서버의 구독 CLI에 있고
 *  토큰당 과금이 아니다. 클라는 이 모드의 예상비용($)을 숨기고 "구독"으로 표시하며,
 *  실 사용량은 구독 윈도우(세션/주간 증가분)로 본다. 인자는 serverInfo.mode(서버가
 *  통보한 실제 모드) 문자열 — AkuAgentMode 뿐 아니라 임의 문자열도 안전. */
const SUBSCRIPTION_MODES: ReadonlySet<string> = new Set(["byo-ssh", "codex-ssh"]);
export function isSubscriptionMode(mode: string | null | undefined): boolean {
  return mode != null && SUBSCRIPTION_MODES.has(mode);
}

const MODE_KEY = "weave.aku.agent-mode";

const MODE_VALUES: ReadonlyArray<string> = [
  "server",
  ...AKU_AGENT_MODE_OPTIONS.map((o) => o.value),
];

/** 과거 저장값 → 현행 모드 마이그레이션 (Rule 6: 데이터, if-체인 금지).
 *  DR-057 이 byo-apikey 를 api 로 흡수 — 저장돼 있던 선택은 api 로 승계된다. */
const MODE_ALIASES: Readonly<Record<string, AkuAgentMode>> = {
  "byo-apikey": "api",
};

function isAkuAgentMode(v: unknown): v is AkuAgentMode {
  return typeof v === "string" && MODE_VALUES.includes(v);
}

/** 저장된 모드 (검증/마이그레이션 통과 시) — 아니면 DEFAULT_AGENT_MODE.
 *  localStorage 차단 환경도 DEFAULT_AGENT_MODE. */
export function loadAgentMode(): AkuAgentMode {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    const migrated = v !== null ? MODE_ALIASES[v] : undefined;
    if (migrated !== undefined) return migrated;
    return isAkuAgentMode(v) ? v : DEFAULT_AGENT_MODE;
  } catch {
    return DEFAULT_AGENT_MODE;
  }
}

export function saveAgentMode(mode: AkuAgentMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // private mode / quota — 이 세션의 state 로는 여전히 동작한다.
  }
}

/** hello 에 실리는 연결 옵션 조각. */
export interface ModeConnectOptions {
  readonly mode?: string;
  readonly apiKey?: string;
}

/** 연결별 API 키 — provider 별로 분리(API transport 만 사용). 키는 비밀: 선택된
 *  provider 에 맞는 키만, 그 transport 가 API 일 때만 hello 에 실린다 (RISK-004). */
export interface AkuApiKeys {
  /** Anthropic 키 (VITE_AKU_API_KEY) — api 모드. */
  readonly anthropic: string | null;
  /** OpenAI 키 (VITE_AKU_OPENAI_API_KEY) — openai-api 모드. */
  readonly openai: string | null;
}

const withKey = (mode: string, key: string | null): ModeConnectOptions => ({
  mode,
  ...(key !== null && key !== "" ? { apiKey: key } : {}),
});

/**
 * 모드별 연결-옵션 어댑터 (Rule 6: 레지스트리, switch/if-체인 금지).
 * - "server": 빈 객체 (hello 에 mode 없음 → 서버 부팅 모드, 기존 동작 100%).
 * - "api" / "openai-api": mode + (설정돼 있을 때만) 해당 provider 의 apiKey — 키
 *   노출의 단일 결정 지점. 키가 실리면 서버는 그 키를 연결별로 사용(keySource:
 *   "client"), 없으면 서버 공유 키로 동작한다.
 * - "byo-ssh" / "codex-ssh": mode 만 — 자격은 서버 쪽(각 구독 CLI)에 있다.
 */
const MODE_CONNECT_OPTIONS: Record<AkuAgentMode, (keys: AkuApiKeys) => ModeConnectOptions> = {
  server: () => ({}),
  api: (keys) => withKey("api", keys.anthropic),
  "openai-api": (keys) => withKey("openai-api", keys.openai),
  "byo-ssh": () => ({ mode: "byo-ssh" }),
  "codex-ssh": () => ({ mode: "codex-ssh" }),
};

/** 연결 옵션 변환 — connect 스프레드용 (`...connectModeOptions(mode, keys)`). */
export function connectModeOptions(mode: AkuAgentMode, keys: AkuApiKeys): ModeConnectOptions {
  return MODE_CONNECT_OPTIONS[mode](keys);
}
