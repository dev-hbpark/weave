/**
 * Aku 에이전트 실행-모드 선택 (WI-175 → WI-176 — small-think WI-042/WI-043 다운스트림).
 *
 * 서버는 부팅 모드(SMALL_THINK_AGENT_MODE) 외에 hello.mode 로 연결별 모드 요청을
 * 받는다(승인은 서버의 SMALL_THINK_ALLOWED_MODES allowlist). 이 모듈은 그 요청을
 * 만드는 클라이언트 쪽 순수 절반: 모드 영속화 + connect 옵션 변환.
 *
 * small-think DR-057 이 byo-apikey 를 api 로 통합했다 — 실행 모드는 이제 2종:
 * - `api`: hello 에 apiKey 가 실리면 그 키(연결별, keySource:"client"), 없으면
 *   서버 공유 키(keySource:"server"). weave 는 `.env` 의 `VITE_AKU_API_KEY` 가
 *   설정돼 있을 때만 키를 싣는다 — env 설정 자체가 운영자의 opt-in 이다.
 *   키 원문은 로그·React props 로 노출하지 않는다 (RISK-004).
 * - `byo-ssh`: 자격은 전부 서버 쪽(구독 CLI) — 클라이언트는 모드만 요청.
 *
 * 승인 여부는 가정하지 않는다: 서버가 거부하면 부팅 모드로 폴백하고 실제 적용
 * 모드를 `serverInfo.mode` 로 통보한다 — AkuServerInfoChip 이 그대로 보여준다.
 */

/** "server" = hello 에 모드를 싣지 않음(서버 부팅 모드 그대로) — 명시적으로 저장된
 *  경우에만 동작하는 레거시/탈출구 값. 나머지 둘은 서버의 실행 모드 2종(DR-057
 *  통합 후)에 대한 요청. 첫 선택 전 기본값은 DEFAULT_AGENT_MODE. */
export type AkuAgentMode = "server" | "api" | "byo-ssh";

/** 첫 선택 전(저장값 없음/가비지/localStorage 차단) 기본 모드 — 운영자 결정(WI-178):
 *  현 배포의 일상 모드가 구독 CLI(byo-ssh)이므로 새 브라우저도 그걸 요청한다.
 *  서버 allowlist 가 거부하면 부팅 모드로 폴백하고 serverInfo.mode 로 통보된다
 *  (WI-175 승인 불가정 원칙 그대로 — 기본값이 바뀌어도 안전). */
export const DEFAULT_AGENT_MODE: AkuAgentMode = "byo-ssh";

/** 세그먼트 컨트롤에 노출하는 선택지 — 실행 모드 2종만 ("server" 는 선택-이전 상태). */
export const AKU_AGENT_MODE_OPTIONS: ReadonlyArray<{
  readonly value: AkuAgentMode;
  readonly label: string;
  readonly hint: string;
}> = [
  {
    value: "api",
    label: "API",
    hint: "API 키로 실행 — weave에 설정된 키(VITE_AKU_API_KEY)가 있으면 그 키, 없으면 서버 공유 키",
  },
  { value: "byo-ssh", label: "SSH", hint: "서버의 구독 CLI(ssh)로 실행" },
];

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

/**
 * 모드별 연결-옵션 어댑터 (Rule 6: 레지스트리, switch/if-체인 금지).
 * - "server": 빈 객체 (hello 에 mode 없음 → 서버 부팅 모드, 기존 동작 100%).
 * - "api": mode + (설정돼 있을 때만) apiKey — 키 노출의 단일 결정 지점.
 *   키가 실리면 서버는 그 키를 연결별로 사용(DR-057 keySource:"client"),
 *   없으면 서버 공유 키로 동작한다.
 * - "byo-ssh": mode 만 — 자격은 서버 쪽(구독 CLI)에 있다.
 */
const MODE_CONNECT_OPTIONS: Record<AkuAgentMode, (apiKey: string | null) => ModeConnectOptions> = {
  server: () => ({}),
  api: (apiKey) => ({
    mode: "api",
    ...(apiKey !== null && apiKey !== "" ? { apiKey } : {}),
  }),
  "byo-ssh": () => ({ mode: "byo-ssh" }),
};

/** 연결 옵션 변환 — connect 스프레드용 (`...connectModeOptions(mode, key)`). */
export function connectModeOptions(mode: AkuAgentMode, apiKey: string | null): ModeConnectOptions {
  return MODE_CONNECT_OPTIONS[mode](apiKey);
}
