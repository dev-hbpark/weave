// AKU agent settings — user-toggleable behaviors, persisted per browser.
//
// Surfaced through the gear icon in the panel header. Each flag gates a real
// behavior in `use-aku-agent` / `AkuComposer` / `AkuPanel`. Grouped for the
// settings UI; `AKU_SETTINGS_SECTIONS` drives the rendering so adding a flag is
// one entry here (no bespoke JSX per toggle).

import { useCallback, useState } from "react";

export interface AkuSettings {
  // ── Design variety ──
  /** Inject a `[디자인 톤]` block + show the tone picker in the composer. */
  readonly designTone: boolean;
  /** With `designTone` on and NO tone picked, rotate tones each generation so
   *  back-to-back runs (and "regenerate") differ. */
  readonly autoRotateTone: boolean;
  /** Show a separate "스타일 레퍼런스 이미지" attach; those images are sent as
   *  style guidance (mimic palette/tone), not content. */
  readonly styleReference: boolean;
  /** Ask the agent to suggest a theme fitting the content's mood; the panel
   *  surfaces a one-click "적용" button when it does. */
  readonly themeAdvice: boolean;
  // ── Agent context ──
  /** Send the `[현재 테마]` line. Off → the agent ignores the active theme
   *  (frees it to commit to the content's own palette → more variety). */
  readonly sendTheme: boolean;
  // ── Behavior ──
  /** Allow the server's pre-generation "which media types?" question. Off →
   *  proceed immediately (answer "none"). */
  readonly askBeforeGenerate: boolean;
  /** Fit the camera to new content after the agent adds slide(s). */
  readonly autoFitCamera: boolean;
  /** Persist the conversation transcript to this browser. */
  readonly persistHistory: boolean;
  // ── Model ──
  /** Sampling creativity — mapped to a per-request temperature sent to the
   *  agent-server (higher = more varied designs from the same prompt). */
  readonly creativity: AkuCreativity;
}

/** Creativity levels → model temperature. "balanced" is a sensible default that
 *  is already meaningfully more varied than the server's deterministic 0. */
export type AkuCreativity = "consistent" | "balanced" | "creative";

export const AKU_CREATIVITY_OPTIONS: ReadonlyArray<{
  readonly value: AkuCreativity;
  readonly label: string;
}> = [
  { value: "consistent", label: "일관" },
  { value: "balanced", label: "균형" },
  { value: "creative", label: "창의" },
];

const CREATIVITY_TEMPERATURE: Record<AkuCreativity, number> = {
  consistent: 0,
  balanced: 0.6,
  creative: 1,
};

/** The per-request temperature for a creativity level. */
export function temperatureForCreativity(level: AkuCreativity): number {
  return CREATIVITY_TEMPERATURE[level];
}

/** Per-level jitter half-width — how far a request may stray from the base
 *  temperature. "consistent" stays exactly 0 (the "일관" promise: deterministic),
 *  the others gain a small seed-derived spread so identical settings sample
 *  differently run-to-run (DR-077 D3). */
const CREATIVITY_JITTER: Record<AkuCreativity, number> = {
  consistent: 0,
  balanced: 0.15,
  creative: 0.1, // already near the 0..1 ceiling — keep the spread modest
};

/** A per-request temperature: the level's base nudged by a seed-derived offset
 *  in [-jitter, +jitter], clamped to [0, 1]. Deterministic in `seed` (the same
 *  per-request variation seed used for the `[변주]` line) so it is unit-testable
 *  and the sampling spread tracks the input variation. */
export function jitteredTemperature(level: AkuCreativity, seed: number): number {
  const base = CREATIVITY_TEMPERATURE[level];
  const jitter = CREATIVITY_JITTER[level];
  if (jitter === 0) return base;
  // seed % 7 → {0..6}; map to [-1, +1] then scale. Stride 7 is co-prime with the
  // variation-knob strides so temperature doesn't lock-step with a single knob.
  const offset = (((seed % 7) / 6) * 2 - 1) * jitter;
  const t = base + offset;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export const DEFAULT_AKU_SETTINGS: AkuSettings = {
  designTone: true,
  autoRotateTone: true,
  styleReference: false,
  themeAdvice: false,
  sendTheme: true,
  askBeforeGenerate: true,
  autoFitCamera: true,
  persistHistory: true,
  creativity: "balanced",
};

export type AkuSettingKey = keyof AkuSettings;

/** Just the boolean toggle keys (excludes `creativity`, which has its own
 *  control). The settings sections render these as switches. */
export type AkuBooleanSettingKey = {
  [K in AkuSettingKey]: AkuSettings[K] extends boolean ? K : never;
}[AkuSettingKey];

/** Panel layout — sections of toggles. `dependsOn` greys an item out unless its
 *  parent flag is on (e.g. auto-rotation only matters when tones are on). */
export interface AkuSettingItem {
  readonly key: AkuBooleanSettingKey;
  readonly label: string;
  readonly hint: string;
  readonly dependsOn?: AkuBooleanSettingKey;
}
export interface AkuSettingSection {
  readonly title: string;
  readonly items: ReadonlyArray<AkuSettingItem>;
}

export const AKU_SETTINGS_SECTIONS: ReadonlyArray<AkuSettingSection> = [
  {
    title: "디자인 다양화",
    items: [
      {
        key: "designTone",
        label: "디자인 톤",
        hint: "톤(무드)을 디자인에 반영하고 톤 피커를 표시",
      },
      {
        key: "autoRotateTone",
        label: "자동 톤 변주",
        hint: "톤 미선택 시 매 생성마다 다른 톤으로",
        dependsOn: "designTone",
      },
      {
        key: "styleReference",
        label: "스타일 레퍼런스 이미지",
        hint: "참고 이미지의 색감·톤·레이아웃을 모사",
      },
      {
        key: "themeAdvice",
        label: "테마 추천",
        hint: "콘텐츠 무드에 맞는 테마를 제안 + 원클릭 적용",
      },
    ],
  },
  {
    title: "에이전트 컨텍스트",
    items: [
      {
        key: "sendTheme",
        label: "현재 테마 전달",
        hint: "끄면 활성 테마를 무시하고 콘텐츠 고유 팔레트로 (다양성 ↑)",
      },
    ],
  },
  {
    title: "동작",
    items: [
      {
        key: "askBeforeGenerate",
        label: "생성 전 질문 받기",
        hint: "이미지/QR 등 포함 여부를 먼저 물어봄",
      },
      {
        key: "autoFitCamera",
        label: "생성 후 카메라 맞춤",
        hint: "슬라이드가 추가되면 화면을 자동으로 맞춤",
      },
      { key: "persistHistory", label: "대화 기록 저장", hint: "이 브라우저에 대화 내용을 저장" },
    ],
  },
];

const STORAGE_KEY = "weave.aku.settings";

/** Load settings, merging over defaults so a newly-added flag uses its default
 *  for old stored blobs (forward-compatible). */
export function loadAkuSettings(): AkuSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_AKU_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AkuSettings>;
    return { ...DEFAULT_AKU_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_AKU_SETTINGS;
  }
}

function saveAkuSettings(s: AkuSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // private mode / quota — settings still apply for this session (state).
  }
}

/** A single-setting setter, typed per key (booleans for toggles, the level union
 *  for `creativity`). */
export type SetAkuSetting = <K extends AkuSettingKey>(key: K, value: AkuSettings[K]) => void;

/** Settings state + a single-setting setter, persisted on every change. */
export function useAkuSettings(): {
  readonly settings: AkuSettings;
  readonly setSetting: SetAkuSetting;
} {
  const [settings, setSettings] = useState<AkuSettings>(loadAkuSettings);
  const setSetting = useCallback<SetAkuSetting>((key, value): void => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveAkuSettings(next);
      return next;
    });
  }, []);
  return { settings, setSetting };
}
