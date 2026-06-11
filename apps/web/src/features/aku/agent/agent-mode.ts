/**
 * Aku 에이전트 실행-모드 선택 (WI-175 — small-think WI-042 / agocraft WI-039 다운스트림).
 *
 * 서버는 부팅 모드(SMALL_THINK_AGENT_MODE) 외에 hello.mode 로 연결별 모드 요청을
 * 받는다(승인은 서버의 SMALL_THINK_ALLOWED_MODES allowlist). 이 모듈은 그 요청을
 * 만드는 클라이언트 쪽 순수 절반: 모드 영속화 + connect 옵션 변환.
 *
 * 키는 UI 입력이 아니라 **미리 설정**한다 (운영자 결정, WI-175):
 * - `api` / `byo-ssh`: 키·자격은 전부 서버 쪽 env — 클라이언트는 모드만 요청.
 * - `byo-apikey`: 프로토콜상 키가 hello 에 실려야 한다(서버 폴백 없음 —
 *   server-agent-session.ts resolveProvider). weave `.env` 의 `VITE_AKU_API_KEY`
 *   로 주입하며, 이 모드일 때만 hello 에 포함된다(최소 노출, RISK-004).
 *   키 원문은 로그·React props 로 노출하지 않는다.
 *
 * 승인 여부는 가정하지 않는다: 서버가 거부하면 부팅 모드로 폴백하고 실제 적용
 * 모드를 `serverInfo.mode` 로 통보한다 — AkuServerInfoChip 이 그대로 보여준다.
 */

/** "server" = hello 에 모드를 싣지 않음(서버 부팅 모드 그대로) — 첫 선택 전 기본값.
 *  나머지 셋은 서버의 실행 모드 3종(DR-013)에 대한 요청. */
export type AkuAgentMode = "server" | "api" | "byo-apikey" | "byo-ssh";

/** 세그먼트 컨트롤에 노출하는 선택지 — 실행 모드 3종만 ("server" 는 선택-이전 상태). */
export const AKU_AGENT_MODE_OPTIONS: ReadonlyArray<{
  readonly value: AkuAgentMode;
  readonly label: string;
  readonly hint: string;
}> = [
  { value: "api", label: "API", hint: "서버 공유 키로 실행" },
  { value: "byo-apikey", label: "BYO 키", hint: "weave에 설정된 키(VITE_AKU_API_KEY)로 실행" },
  { value: "byo-ssh", label: "SSH", hint: "서버의 구독 CLI(ssh)로 실행" },
];

const MODE_KEY = "weave.aku.agent-mode";

const MODE_VALUES: ReadonlyArray<string> = [
  "server",
  ...AKU_AGENT_MODE_OPTIONS.map((o) => o.value),
];

function isAkuAgentMode(v: unknown): v is AkuAgentMode {
  return typeof v === "string" && MODE_VALUES.includes(v);
}

/** 저장된 모드 (검증 통과 시) — 아니면 "server". localStorage 차단 환경도 "server". */
export function loadAgentMode(): AkuAgentMode {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return isAkuAgentMode(v) ? v : "server";
  } catch {
    return "server";
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
 * - "api" / "byo-ssh": mode 만 — 키·자격은 서버 쪽에 있다.
 * - "byo-apikey": mode + (있을 때만) apiKey — 키 노출의 단일 결정 지점.
 */
const MODE_CONNECT_OPTIONS: Record<AkuAgentMode, (apiKey: string | null) => ModeConnectOptions> = {
  server: () => ({}),
  api: () => ({ mode: "api" }),
  "byo-apikey": (apiKey) => ({
    mode: "byo-apikey",
    ...(apiKey !== null && apiKey !== "" ? { apiKey } : {}),
  }),
  "byo-ssh": () => ({ mode: "byo-ssh" }),
};

/** 연결 옵션 변환 — connect 스프레드용 (`...connectModeOptions(mode, key)`). */
export function connectModeOptions(mode: AkuAgentMode, apiKey: string | null): ModeConnectOptions {
  return MODE_CONNECT_OPTIONS[mode](apiKey);
}
