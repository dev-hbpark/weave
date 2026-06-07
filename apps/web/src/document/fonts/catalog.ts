// WI-136 — Font catalog registry (SSOT).
//
// Replaces the hardcoded `FONT_FAMILY_PRESETS` + the giant static
// `<link>` in index.html. Each entry declares enough metadata to (a) render
// the picker (label / category / subsets), (b) load the webfont on demand
// (source / family / weights — see font-loader.ts), and (c) store a stable
// CSS font-family stack on a text item when the user picks a specific font.
//
// Rule 6: this is a data registry. Branching on `source` / `category` is a
// Map / filter over this list, never a `switch`. Adding a font = one entry.
//
// The `stack` is the value written onto `attrs.fontFamily` for a per-item
// override; it must stay STABLE across releases (round-trip identity), so
// stacks are derived deterministically from (family, category, korean?).

export type FontSource = "system" | "google";
export type FontCategory = "sans" | "serif" | "mono" | "display" | "handwriting";
export type FontSubset = "latin" | "korean";

export interface FontEntry {
  /** Stable key — used by the loader's dedup set and ad-hoc lookups. */
  readonly id: string;
  /** Human label shown in the picker. */
  readonly label: string;
  /** Full CSS font-family stack written onto `attrs.fontFamily` for an
   *  explicit per-item font override. */
  readonly stack: string;
  /** Google Fonts family name used to build the css2 request. Empty for
   *  `system` source (nothing to load). */
  readonly family: string;
  readonly source: FontSource;
  readonly category: FontCategory;
  readonly subsets: ReadonlyArray<FontSubset>;
  /** Weights to request from Google Fonts. Kept lean to limit transfer. */
  readonly weights: ReadonlyArray<number>;
}

/** Per-category system fallback tail appended after the primary family. */
const CATEGORY_FALLBACK: Record<FontCategory, string> = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  display: "system-ui, 'Segoe UI', sans-serif",
  handwriting: "'Comic Sans MS', cursive",
};

/** Korean fallback inserted before the category tail for korean-subset fonts
 *  so missing glyphs fall back to a platform Korean face, not Times. */
const KOREAN_FALLBACK = "'Apple SD Gothic Neo', 'Malgun Gothic'";

function buildStack(family: string, category: FontCategory, korean: boolean): string {
  const ko = korean ? `${KOREAN_FALLBACK}, ` : "";
  return `'${family}', ${ko}${CATEGORY_FALLBACK[category]}`;
}

/** Authoring shape — the full `FontEntry` is derived from this. */
interface FontSpec {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly category: FontCategory;
  /** Defaults to `["latin"]`. Korean fonts list `["latin","korean"]`. */
  readonly subsets?: ReadonlyArray<FontSubset>;
  /** Defaults to `[400, 700]`. */
  readonly weights?: ReadonlyArray<number>;
  /** `system` fonts override the derived stack and load nothing. */
  readonly system?: { readonly stack: string };
}

const SANS_WEIGHTS = [400, 500, 600, 700];
const STD_WEIGHTS = [400, 700];

const SPECS: ReadonlyArray<FontSpec> = [
  // System — no network, always available.
  {
    id: "system-ui",
    label: "System UI",
    family: "",
    category: "sans",
    system: {
      stack:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
  },

  // Sans (latin).
  { id: "inter", label: "Inter", family: "Inter", category: "sans", weights: SANS_WEIGHTS },
  { id: "roboto", label: "Roboto", family: "Roboto", category: "sans", weights: SANS_WEIGHTS },
  {
    id: "open-sans",
    label: "Open Sans",
    family: "Open Sans",
    category: "sans",
    weights: SANS_WEIGHTS,
  },
  { id: "lato", label: "Lato", family: "Lato", category: "sans", weights: STD_WEIGHTS },
  {
    id: "montserrat",
    label: "Montserrat",
    family: "Montserrat",
    category: "sans",
    weights: SANS_WEIGHTS,
  },
  { id: "poppins", label: "Poppins", family: "Poppins", category: "sans", weights: SANS_WEIGHTS },
  {
    id: "work-sans",
    label: "Work Sans",
    family: "Work Sans",
    category: "sans",
    weights: SANS_WEIGHTS,
  },
  { id: "nunito", label: "Nunito", family: "Nunito", category: "sans", weights: STD_WEIGHTS },
  { id: "raleway", label: "Raleway", family: "Raleway", category: "sans", weights: STD_WEIGHTS },
  { id: "dm-sans", label: "DM Sans", family: "DM Sans", category: "sans", weights: SANS_WEIGHTS },
  { id: "manrope", label: "Manrope", family: "Manrope", category: "sans", weights: SANS_WEIGHTS },

  // Serif (latin).
  {
    id: "playfair-display",
    label: "Playfair Display",
    family: "Playfair Display",
    category: "serif",
    weights: STD_WEIGHTS,
  },
  {
    id: "merriweather",
    label: "Merriweather",
    family: "Merriweather",
    category: "serif",
    weights: STD_WEIGHTS,
  },
  { id: "lora", label: "Lora", family: "Lora", category: "serif", weights: STD_WEIGHTS },
  {
    id: "pt-serif",
    label: "PT Serif",
    family: "PT Serif",
    category: "serif",
    weights: STD_WEIGHTS,
  },
  {
    id: "source-serif-4",
    label: "Source Serif 4",
    family: "Source Serif 4",
    category: "serif",
    weights: STD_WEIGHTS,
  },
  {
    id: "eb-garamond",
    label: "EB Garamond",
    family: "EB Garamond",
    category: "serif",
    weights: STD_WEIGHTS,
  },

  // Mono.
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    family: "JetBrains Mono",
    category: "mono",
    weights: SANS_WEIGHTS,
  },
  {
    id: "fira-code",
    label: "Fira Code",
    family: "Fira Code",
    category: "mono",
    weights: STD_WEIGHTS,
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    family: "IBM Plex Mono",
    category: "mono",
    weights: STD_WEIGHTS,
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    family: "Source Code Pro",
    category: "mono",
    weights: STD_WEIGHTS,
  },
  {
    id: "roboto-mono",
    label: "Roboto Mono",
    family: "Roboto Mono",
    category: "mono",
    weights: STD_WEIGHTS,
  },

  // Display.
  {
    id: "bebas-neue",
    label: "Bebas Neue",
    family: "Bebas Neue",
    category: "display",
    weights: [400],
  },
  { id: "oswald", label: "Oswald", family: "Oswald", category: "display", weights: STD_WEIGHTS },
  {
    id: "archivo-black",
    label: "Archivo Black",
    family: "Archivo Black",
    category: "display",
    weights: [400],
  },
  {
    id: "abril-fatface",
    label: "Abril Fatface",
    family: "Abril Fatface",
    category: "display",
    weights: [400],
  },

  // Handwriting.
  {
    id: "caveat",
    label: "Caveat",
    family: "Caveat",
    category: "handwriting",
    weights: [400, 500, 700],
  },
  {
    id: "pacifico",
    label: "Pacifico",
    family: "Pacifico",
    category: "handwriting",
    weights: [400],
  },
  {
    id: "dancing-script",
    label: "Dancing Script",
    family: "Dancing Script",
    category: "handwriting",
    weights: STD_WEIGHTS,
  },
  {
    id: "shadows-into-light",
    label: "Shadows Into Light",
    family: "Shadows Into Light",
    category: "handwriting",
    weights: [400],
  },

  // Korean (latin + korean subsets).
  {
    id: "noto-sans-kr",
    label: "Noto Sans KR",
    family: "Noto Sans KR",
    category: "sans",
    subsets: ["latin", "korean"],
    weights: SANS_WEIGHTS,
  },
  {
    id: "noto-serif-kr",
    label: "Noto Serif KR",
    family: "Noto Serif KR",
    category: "serif",
    subsets: ["latin", "korean"],
    weights: STD_WEIGHTS,
  },
  {
    id: "nanum-gothic",
    label: "나눔고딕",
    family: "Nanum Gothic",
    category: "sans",
    subsets: ["latin", "korean"],
    weights: STD_WEIGHTS,
  },
  {
    id: "nanum-myeongjo",
    label: "나눔명조",
    family: "Nanum Myeongjo",
    category: "serif",
    subsets: ["latin", "korean"],
    weights: STD_WEIGHTS,
  },
  {
    id: "ibm-plex-sans-kr",
    label: "IBM Plex Sans KR",
    family: "IBM Plex Sans KR",
    category: "sans",
    subsets: ["latin", "korean"],
    weights: STD_WEIGHTS,
  },
  {
    id: "gowun-dodum",
    label: "고운돋움",
    family: "Gowun Dodum",
    category: "sans",
    subsets: ["latin", "korean"],
    weights: [400],
  },
  {
    id: "black-han-sans",
    label: "검은고딕",
    family: "Black Han Sans",
    category: "display",
    subsets: ["latin", "korean"],
    weights: [400],
  },
  {
    id: "do-hyeon",
    label: "도현",
    family: "Do Hyeon",
    category: "display",
    subsets: ["latin", "korean"],
    weights: [400],
  },
  {
    id: "jua",
    label: "주아",
    family: "Jua",
    category: "display",
    subsets: ["latin", "korean"],
    weights: [400],
  },
  {
    id: "gaegu",
    label: "개구",
    family: "Gaegu",
    category: "handwriting",
    subsets: ["latin", "korean"],
    weights: STD_WEIGHTS,
  },
  {
    id: "nanum-pen-script",
    label: "나눔손글씨 펜",
    family: "Nanum Pen Script",
    category: "handwriting",
    subsets: ["latin", "korean"],
    weights: [400],
  },
];

function toEntry(spec: FontSpec): FontEntry {
  const subsets = spec.subsets ?? ["latin"];
  const korean = subsets.includes("korean");
  if (spec.system !== undefined) {
    return {
      id: spec.id,
      label: spec.label,
      stack: spec.system.stack,
      family: "",
      source: "system",
      category: spec.category,
      subsets,
      weights: [],
    };
  }
  return {
    id: spec.id,
    label: spec.label,
    stack: buildStack(spec.family, spec.category, korean),
    family: spec.family,
    source: "google",
    category: spec.category,
    subsets,
    weights: spec.weights ?? STD_WEIGHTS,
  };
}

/** Curated catalog — the picker's default browse surface. SSOT. */
export const FONT_CATALOG: ReadonlyArray<FontEntry> = SPECS.map(toEntry);

/** id → entry. */
export const FONT_BY_ID: ReadonlyMap<string, FontEntry> = new Map(
  FONT_CATALOG.map((f) => [f.id, f]),
);

/** stored stack → entry. Recognizes an explicit per-item font override so the
 *  loader knows what to load and the picker can render its label. */
export const FONT_BY_STACK: ReadonlyMap<string, FontEntry> = new Map(
  FONT_CATALOG.map((f) => [f.stack, f]),
);

/** Friendly label for a stored `fontFamily` value (catalog label, theme-role
 *  label, else the first family in the stack). */
export function fontLabel(value: string): string {
  const hit = FONT_BY_STACK.get(value);
  if (hit !== undefined) return hit.label;
  const role = ROLE_LABEL.get(value.trim());
  if (role !== undefined) return role;
  return value.split(",")[0]?.replace(/['"]/g, "").trim() ?? value;
}

/** Theme typography role values (WI-136 Phase 2). A text item bound to a role
 *  stores the literal CSS var string — exactly like the theme-reactive color
 *  default (`var(--text-default)`) — so the active `[data-theme]` resolves the
 *  font with no document mutation. */
export interface FontRole {
  readonly id: "display" | "body" | "mono";
  readonly label: string;
  readonly varName: string;
  /** Value written onto `attrs.fontFamily`. */
  readonly value: string;
}

export const FONT_ROLES: ReadonlyArray<FontRole> = [
  { id: "display", label: "제목", varName: "--font-display", value: "var(--font-display)" },
  { id: "body", label: "본문", varName: "--font-sans", value: "var(--font-sans)" },
  { id: "mono", label: "모노", varName: "--font-mono", value: "var(--font-mono)" },
];

const ROLE_LABEL: ReadonlyMap<string, string> = new Map(
  FONT_ROLES.map((r) => [r.value, `${r.label} (테마)`]),
);

/** The default `fontFamily` for a freshly-created text item — the theme body
 *  role, so new text is theme-reactive by default (parallels the color
 *  default `var(--text-default)`). */
export const DEFAULT_TEXT_FONT_FAMILY = "var(--font-sans)";

/** Display labels + ordering for the picker's category sections. */
export const FONT_CATEGORY_LABEL: Record<FontCategory, string> = {
  sans: "산세리프",
  serif: "세리프",
  display: "디스플레이",
  handwriting: "손글씨",
  mono: "모노",
};

const CATEGORY_ORDER: ReadonlyArray<FontCategory> = [
  "sans",
  "serif",
  "display",
  "handwriting",
  "mono",
];

export interface FontGroup {
  readonly category: FontCategory;
  readonly label: string;
  readonly fonts: ReadonlyArray<FontEntry>;
}

/** Catalog grouped by category in display order — drives the picker sections. */
export const FONT_GROUPS: ReadonlyArray<FontGroup> = CATEGORY_ORDER.map((category) => ({
  category,
  label: FONT_CATEGORY_LABEL[category],
  fonts: FONT_CATALOG.filter((f) => f.category === category),
})).filter((g) => g.fonts.length > 0);

/** Stable id from a Google family name (`"Playfair Display"` → `playfair-display`). */
export function fontIdFromFamily(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build a `FontEntry` for an arbitrary Google font NOT in the curated catalog
 *  (WI-136 Phase 6 — "모든 폰트 찾아보기"). Same deterministic stack derivation as
 *  the curated entries so a chosen font round-trips identically. */
export function makeGoogleFontEntry(
  family: string,
  category: FontCategory,
  subsets: ReadonlyArray<FontSubset> = ["latin"],
  weights: ReadonlyArray<number> = STD_WEIGHTS,
): FontEntry {
  return {
    id: fontIdFromFamily(family),
    label: family,
    stack: buildStack(family, category, subsets.includes("korean")),
    family,
    source: "google",
    category,
    subsets,
    weights,
  };
}
