// AKU design-style directions — the single biggest lever for design VARIETY.
//
// The agent-server's sampling (temperature) is fixed server-side and not
// reachable from weave, so identical input → identical output. The practical
// fix is to VARY THE INPUT: inject an explicit "design tone" block into each
// task. The block names a concrete mood with a LITERAL palette + typography +
// shape language, and tells the agent to commit to it for expressive surfaces
// (backgrounds / hero / accent panels) instead of falling back to the active
// theme's `var(--token)` colors (which is what makes every design look the
// same). Structural text colors stay on tokens so theme-switching still works.
//
// Two modes (both wired): the user picks a tone in the composer, OR — when no
// tone is picked — `nextAutoStyle()` rotates through the catalog so consecutive
// generations (incl. "regenerate") differ.

export interface AkuStyle {
  /** Stable id (persisted in the picker selection). */
  readonly id: string;
  /** Short Korean chip label. */
  readonly label: string;
  /** The `[디자인 톤]` prompt fragment injected into the task text. */
  readonly prompt: string;
}

/** Shared tail appended to every tone prompt — resolves the token-vs-mood
 *  tension in the cached capabilities in favour of THIS design's palette. */
const COMMIT_TAIL =
  " 이 톤을 레이아웃·타이포·여백·도형·색까지 일관되게 커밋하세요. 배경·히어로·강조 패널 같은 표현 영역엔 위의 리터럴 색(또는 같은 계열의 커스텀 팔레트)을 쓰고, 본문 텍스트 등 구조 색만 var(--token)으로 두세요 — 현재 활성 테마의 룩에 끌려가지 마세요.";

export const AKU_STYLES: ReadonlyArray<AkuStyle> = [
  {
    id: "editorial",
    label: "에디토리얼",
    prompt:
      "잡지 에디토리얼 톤 — 큰 세리프 제목, 넉넉한 여백과 컬럼 그리드, 거의 흑백(#111111 / #FAF8F4)에 단 하나의 강조색(예: #C8102E). 얇은 구분선, 절제되고 활자 중심.",
  },
  {
    id: "bold",
    label: "볼드",
    prompt:
      "볼드 하이임팩트 톤 — 초대형 산세리프, 강한 대비, 채도 높은 한 색의 풀블리드 컬러블록(예: #FF3B30 또는 #0A84FF)에 흰 텍스트, 굵은 기하 도형, 타이트한 패킹.",
  },
  {
    id: "minimal",
    label: "미니멀",
    prompt:
      "미니멀 톤 — 거의 흑백(#111111 / #FFFFFF), 가는 타이포, 극도의 여백과 정렬, 도형 최소, 아주 작은 단일 포인트 강조만. 조용하고 정밀하게.",
  },
  {
    id: "warm",
    label: "따뜻한",
    prompt:
      "따뜻한 어스톤 톤 — 베이지·테라코타·올리브(#E8DCC8 / #C97B5A / #7A8450), 둥근 모서리, 부드러운 그림자, 유기적이고 손맛 있는 배치. 자연스럽고 포근하게.",
  },
  {
    id: "retro",
    label: "레트로",
    prompt:
      "70~80년대 레트로 톤 — 머스타드·오렌지·틸(#E0A458 / #D9603B / #2A7E78), 두꺼운 외곽선, 기하 패턴과 빈티지 세리프, 약간의 그레인 느낌. 향수 어린 분위기.",
  },
  {
    id: "luxury",
    label: "럭셔리",
    prompt:
      "럭셔리 톤 — 딥 네이비/차콜 바탕(#0B1E3A / #1A1A1A)에 절제된 골드(#C9A24B), 가는 세리프와 넓은 자간, 얇은 골드 라인. 고급스럽고 차분하게.",
  },
  {
    id: "playful",
    label: "플레이풀",
    prompt:
      "플레이풀 톤 — 비비드 멀티컬러(#FF4D8D / #3DD6C4 / #FFD23F), 둥글둥글한 도형과 큼직한 라운드 산세리프, 통통하고 경쾌한 요소. 밝고 친근하게.",
  },
];

const STYLE_BY_ID = new Map(AKU_STYLES.map((s) => [s.id, s]));

/** Resolve a style id to its catalog entry (undefined for unknown / `null`). */
export function styleById(id: string | null | undefined): AkuStyle | undefined {
  return id == null ? undefined : STYLE_BY_ID.get(id);
}

/** Build the `[디자인 톤]` task block for a chosen style. Empty string when no
 *  style (caller injects nothing). */
export function styleTaskLine(style: AkuStyle | undefined): string {
  if (style === undefined) return "";
  return `\n\n[디자인 톤] ${style.prompt}${COMMIT_TAIL}`;
}

/** Rotation cursor for AUTO mode (no user pick). Seeded with `start` so a
 *  session doesn't always begin at the same tone; each call advances by one so
 *  consecutive generations — and "regenerate" — land on a different tone. The
 *  caller owns the cursor (a ref) so rotation persists across renders. */
export function nextAutoStyle(cursor: { value: number }): AkuStyle {
  const idx = ((cursor.value % AKU_STYLES.length) + AKU_STYLES.length) % AKU_STYLES.length;
  cursor.value += 1;
  return AKU_STYLES[idx] as AkuStyle;
}
