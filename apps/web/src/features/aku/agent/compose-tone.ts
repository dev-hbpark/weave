// AKU tone COMPOSITION — presets, per-request resolution, and the `[디자인 톤]`
// task block (DR-077 D1/D4). Sits on top of the axis registry (tone-axes.ts).
//
// A PRESET is the named, curated entry point (the 7 chips in the composer). It
// PINS a subset of axes — its identity — and leaves the rest FREE to vary per
// request. So picking "에디토리얼" keeps its serif/ink/grid identity while its
// decor + shape still rotate each generation; "자동" (no preset) frees ALL axes
// for maximum variety. This is the ceiling lift: 7 tones → product of axes,
// while the familiar 7 names still anchor the UI.
//
// D4 (anti-convergence): `resolveTonePicks` takes an `exclude` map — the
// previous generation's picks — and steers FREE axes away from them, so a
// "regenerate" jumps rather than micro-varies. Pinned axes ignore exclusion
// (identity must survive a regenerate).

import { type AxisKey, type AxisOption, optionById, sampleOption, TONE_AXES } from "./tone-axes.js";

/** One resolved option per axis — the full design tone for a single request. */
export type TonePicks = Readonly<Record<AxisKey, AxisOption>>;

/** The id of each picked option per axis — the serializable shape persisted as
 *  the D4 exclusion set for the next generation. */
export type TonePickIds = Partial<Record<AxisKey, string>>;

/** Shared tail — commit to THIS design's palette/look over the active theme's
 *  tokens, but keep structural text colours on `var(--token)` so theme-switching
 *  still works. The palette fragment is a family RANGE (DR-077 D2), so the tail
 *  asks for a fresh concrete palette each run. */
const COMMIT_TAIL =
  " 팔레트는 계열(family)이니 이번 생성에서 그 안의 구체 색을 새로 정하고(직전과 다른 조합으로), 레이아웃·타이포·여백·도형까지 일관되게 커밋하세요. 배경·히어로·강조 패널 같은 표현 영역엔 그 팔레트를, 본문 텍스트 등 구조 색만 var(--token)으로 두세요 — 현재 활성 테마의 룩에 끌려가지 마세요.";

/** A curated, named entry point. `pins` fixes axes to specific option ids; any
 *  axis absent from `pins` is FREE (sampled + varied per request). */
export interface TonePreset {
  readonly id: string;
  readonly label: string;
  /** Tooltip / chip description (human-facing). */
  readonly summary: string;
  readonly pins: Partial<Record<AxisKey, string>>;
}

/** The 7 named tones, now expressed as axis pins (DR-077 D1 — identity preserved,
 *  hub for the composer chips). Each leaves 1–2 axes free so even a fixed pick
 *  varies run-to-run. */
export const TONE_PRESETS: ReadonlyArray<TonePreset> = [
  {
    id: "editorial",
    label: "에디토리얼",
    summary: "잡지 에디토리얼 — 세리프·잉크·컬럼 그리드 (장식/형태는 변주)",
    pins: { palette: "ink", typography: "serif-display", layout: "column-grid" },
  },
  {
    id: "bold",
    label: "볼드",
    summary: "볼드 하이임팩트 — 풀블리드 컬러블록·초대형 산세 (레이아웃은 변주)",
    pins: {
      palette: "vivid-mono",
      typography: "giant-sans",
      decor: "color-block",
      shape: "bold-geo",
    },
  },
  {
    id: "minimal",
    label: "미니멀",
    summary: "미니멀 — 모노·가는 산세·에어리·플랫 (형태는 변주)",
    pins: { palette: "mono", typography: "thin-sans", layout: "airy", decor: "flat" },
  },
  {
    id: "warm",
    label: "따뜻한",
    summary: "따뜻한 어스톤 — 어스 팔레트·유기적 형태 (타이포/레이아웃/장식은 변주)",
    pins: { palette: "earth", shape: "organic" },
  },
  {
    id: "retro",
    label: "레트로",
    summary: "70~80s 레트로 — 빈티지 팔레트·세리프·기하패턴 (레이아웃/형태는 변주)",
    pins: { palette: "retro", typography: "vintage-serif", decor: "geo-pattern" },
  },
  {
    id: "luxury",
    label: "럭셔리",
    summary: "럭셔리 — 딥+메탈릭·가는 세리프·라인워크 (레이아웃/형태는 변주)",
    pins: { palette: "deep-metal", typography: "thin-sans", decor: "line-work" },
  },
  {
    id: "playful",
    label: "플레이풀",
    summary: "플레이풀 — 캔디 멀티컬러·라운드 산세·둥근 형태 (레이아웃/장식은 변주)",
    pins: { palette: "candy", typography: "round-sans", shape: "rounded" },
  },
];

const PRESET_BY_ID = new Map(TONE_PRESETS.map((p) => [p.id, p]));

/** Resolve a preset by id (undefined for null/unknown → "자동"/all-free). */
export function presetById(id: string | null | undefined): TonePreset | undefined {
  return id == null ? undefined : PRESET_BY_ID.get(id);
}

export interface ResolveToneOptions {
  /** A pinned preset, or undefined for "자동" (every axis free). */
  readonly preset?: TonePreset | undefined;
  /** Per-request variation seed — drives the free-axis sampling. */
  readonly seed: number;
  /** Previous generation's picks; free axes steer away from these (D4). */
  readonly exclude?: TonePickIds | undefined;
}

/** Resolve the full per-request tone: pinned axes take their preset option;
 *  free axes are sampled by `seed` and steered away from `exclude`. Pure. */
export function resolveTonePicks(opts: ResolveToneOptions): TonePicks {
  const picks: Partial<Record<AxisKey, AxisOption>> = {};
  TONE_AXES.forEach((axis, i) => {
    const pinnedId = opts.preset?.pins[axis.key];
    const pinned = pinnedId !== undefined ? optionById(axis, pinnedId) : undefined;
    picks[axis.key] = pinned ?? sampleOption(axis, opts.seed, i, opts.exclude?.[axis.key]);
  });
  return picks as TonePicks;
}

/** The serializable id map for a resolved tone (persisted as next D4 exclusion). */
export function picksToIds(picks: TonePicks): TonePickIds {
  const ids: TonePickIds = {};
  for (const axis of TONE_AXES) ids[axis.key] = picks[axis.key].id;
  return ids;
}

/** Build the `[디자인 톤]` task block from resolved picks. */
export function composeToneTask(picks: TonePicks): string {
  const body = TONE_AXES.map((a) => picks[a.key].prompt).join(" · ");
  return `\n\n[디자인 톤] ${body}.${COMMIT_TAIL}`;
}

// ── Register mapping (HANDOFF-025 → small-think DR-043) ────────────────────────
// The design server conditions its restraint policy on an aesthetic REGISTER so
// expressive presets aren't flattened. weave knows the picked preset, so it maps
// preset → register and sends it per submit. A lookup, not a switch (Rule 6).

/** Aesthetic register archetypes — mirrors `@small-think/client`
 *  SubmitOptions["register"] (kept local to avoid importing the vendored type). */
export type AkuRegister = "sober" | "editorial" | "expressive" | "playful";

const PRESET_REGISTER: Readonly<Record<string, AkuRegister>> = {
  editorial: "editorial",
  minimal: "sober",
  luxury: "sober",
  bold: "expressive",
  retro: "expressive",
  warm: "expressive",
  playful: "playful",
};

/** The register for a picked preset, or undefined for 자동/unknown (→ the server
 *  infers the register from content; DR-077 auto mode varies all axes anyway). */
export function presetToRegister(presetId: string | null | undefined): AkuRegister | undefined {
  return presetId == null ? undefined : PRESET_REGISTER[presetId];
}
