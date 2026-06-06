// AKU design-tone AXES — the variety ceiling (DR-077 D1).
//
// Phase 1 made each of 7 closed tones vary WITHIN itself. Phase 2 raises the
// CEILING: a tone is no longer one opaque prompt but a point in the product of
// five independent axes —
//
//   palette × typography × layout × decor × shape
//
// Each axis is a flat registry of options (`{ id, label, prompt }`); the prompt
// is a short fragment joined into the `[디자인 톤]` block by `composeToneTask`
// (see compose-tone.ts). Adding an option is one array entry; adding an axis is
// one `TONE_AXES` entry — no `switch (kind)` anywhere (루트 CLAUDE.md Rule 6 /
// OCP). The named 7 tones survive as PRESETS that pin a subset of axes and let
// the rest vary per request (compose-tone.ts § TONE_PRESETS).
//
// DECOR is the axis that directly targets the user's complaint — title/
// background decoration strategy — so the same palette still reads differently
// run-to-run.

export interface AxisOption {
  /** Stable id (referenced by presets + persisted in D4 exclusion sets). */
  readonly id: string;
  /** Short Korean label (for any future per-axis UI; presets drive today's UI). */
  readonly label: string;
  /** Prompt fragment, no leading/trailing punctuation — joined by " · ". */
  readonly prompt: string;
}

export type AxisKey = "palette" | "typography" | "layout" | "decor" | "shape";

export interface ToneAxis {
  readonly key: AxisKey;
  readonly title: string;
  readonly options: ReadonlyArray<AxisOption>;
}

// ── Palette — family RANGES, not fixed hex (DR-077 D2 lives here now) ──────────
export const PALETTE_AXIS: ReadonlyArray<AxisOption> = [
  {
    id: "ink",
    label: "잉크",
    prompt:
      "거의 흑백 잉크(차콜~블랙)에 밝은 페이퍼 바탕, 강조색 하나를 이번 생성마다 다른 계열에서(크림슨·잉크블루·포레스트·머스타드 중 택1)",
  },
  {
    id: "mono",
    label: "모노",
    prompt:
      "거의 흑백(잉크~화이트)에 아주 작은 단일 포인트 강조색만, 그 hue는 이번 생성마다 다르게",
  },
  {
    id: "vivid-mono",
    label: "비비드모노",
    prompt: "채도 높은 한 색의 풀블리드(레드·블루·오렌지·마젠타·바이올렛 계열 중 택1)에 흰 텍스트",
  },
  {
    id: "earth",
    label: "어스",
    prompt: "베이지·테라코타·올리브·머스타드·러스트의 따뜻한 어스 계열에서 이번 팔레트를 구성",
  },
  {
    id: "retro",
    label: "레트로",
    prompt: "머스타드·오렌지·틸·브라운·크림의 70~80년대 빈티지 계열에서 이번 팔레트를 구성",
  },
  {
    id: "deep-metal",
    label: "딥메탈",
    prompt:
      "딥 그라운드(네이비·차콜·와인·딥포레스트 중 하나)에 메탈릭 강조(골드·샴페인·브론즈·실버 중 하나)",
  },
  {
    id: "candy",
    label: "캔디",
    prompt: "비비드 멀티컬러(핫핑크·민트·옐로·코랄·스카이·라임)에서 이번 생성마다 다른 3색 조합",
  },
];

// ── Typography ────────────────────────────────────────────────────────────────
export const TYPOGRAPHY_AXIS: ReadonlyArray<AxisOption> = [
  { id: "serif-display", label: "세리프", prompt: "큰 세리프 제목과 활자 중심의 위계" },
  { id: "giant-sans", label: "산세리프", prompt: "초대형 산세리프, 강한 대비의 타이포" },
  { id: "thin-sans", label: "가는산세", prompt: "가는 산세리프, 넓은 자간, 절제된 위계" },
  { id: "round-sans", label: "라운드", prompt: "큼직한 라운드 산세리프, 통통한 글자" },
  { id: "vintage-serif", label: "빈티지세리프", prompt: "빈티지 세리프와 굵은 외곽 글자" },
];

// ── Layout (absorbs Phase 1's composition + density knobs) ────────────────────
export const LAYOUT_AXIS: ReadonlyArray<AxisOption> = [
  { id: "column-grid", label: "컬럼그리드", prompt: "넉넉한 여백의 컬럼 그리드, 정렬 중심" },
  { id: "asymmetric", label: "비대칭", prompt: "비대칭 구도와 과감한 여백 대비" },
  { id: "centered", label: "중앙", prompt: "중앙 정렬, 대칭과 균형" },
  { id: "tight-pack", label: "타이트", prompt: "요소를 타이트하게 패킹한 고밀도 배치" },
  { id: "airy", label: "에어리", prompt: "극도의 여백과 큰 침묵 공간" },
];

// ── Decor — title/background decoration STRATEGY (the direct lever) ────────────
export const DECOR_AXIS: ReadonlyArray<AxisOption> = [
  { id: "flat", label: "플랫", prompt: "배경은 단색 플랫, 장식 최소" },
  { id: "gradient", label: "그라데이션", prompt: "배경에 부드러운 그라데이션" },
  { id: "geo-pattern", label: "기하패턴", prompt: "배경·타이틀에 기하 패턴 모티프" },
  { id: "color-block", label: "컬러블록", prompt: "풀블리드 컬러블록으로 타이틀 영역을 구획" },
  { id: "line-work", label: "라인워크", prompt: "얇은 선·구분선·프레임 라인 장식" },
  { id: "grain-texture", label: "그레인", prompt: "미세한 그레인/노이즈 텍스처 질감" },
];

// ── Shape ─────────────────────────────────────────────────────────────────────
export const SHAPE_AXIS: ReadonlyArray<AxisOption> = [
  { id: "sharp", label: "샤프", prompt: "각진 모서리와 직선적 형태" },
  { id: "rounded", label: "라운드", prompt: "둥근 모서리와 부드러운 형태" },
  { id: "organic", label: "유기적", prompt: "유기적이고 손맛 있는 비정형 형태" },
  { id: "bold-geo", label: "볼드기하", prompt: "굵은 기하 도형" },
];

/** The axis registry. Join order here = the order fragments appear in the
 *  `[디자인 톤]` block. Adding an axis is one entry (OCP). */
export const TONE_AXES: ReadonlyArray<ToneAxis> = [
  { key: "palette", title: "팔레트", options: PALETTE_AXIS },
  { key: "typography", title: "타이포", options: TYPOGRAPHY_AXIS },
  { key: "layout", title: "레이아웃", options: LAYOUT_AXIS },
  { key: "decor", title: "장식", options: DECOR_AXIS },
  { key: "shape", title: "형태", options: SHAPE_AXIS },
];

const AXIS_BY_KEY = new Map(TONE_AXES.map((a) => [a.key, a]));

/** Resolve an axis by key (undefined for unknown). */
export function axisByKey(key: AxisKey): ToneAxis | undefined {
  return AXIS_BY_KEY.get(key);
}

/** Resolve an option within an axis by id (undefined for unknown). */
export function optionById(axis: ToneAxis, id: string): AxisOption | undefined {
  return axis.options.find((o) => o.id === id);
}

/** Deterministically sample one option from an axis by `seed`. `axisIndex` gives
 *  each axis a different stride so axes don't move in lock-step. When the picked
 *  option equals `excludeId` (D4 anti-convergence — the previous generation's
 *  pick), advance by one so a repeat-generation lands elsewhere. Pure. */
export function sampleOption(
  axis: ToneAxis,
  seed: number,
  axisIndex: number,
  excludeId?: string,
): AxisOption {
  const n = axis.options.length;
  let idx = ((Math.floor(seed / (axisIndex + 1)) % n) + n) % n;
  if (excludeId !== undefined && n > 1 && axis.options[idx]?.id === excludeId) {
    idx = (idx + 1) % n;
  }
  return axis.options[idx] as AxisOption;
}
