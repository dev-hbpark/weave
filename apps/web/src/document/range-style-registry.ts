// DR-062 — per-range typography property registry.
//
// The SINGLE branch point over "which text style property" (CODE_STRUCTURE
// Rule 6). One descriptor per styleable run property; the bridge
// (`active-text-style.ts`), the read-back (`nodeToAttributes`), and the editor
// seed all ITERATE this table instead of switching on the property name. Adding
// a per-range property is one row here, never a new `if`/`switch`.
//
// Scope: CSS-DECLARATION props authored via `$patchStyleText` (color / size /
// family / spacing / case). The FORMAT-bitmask props (bold / italic / underline
// / strikethrough) use Lexical's native `FORMAT_TEXT_COMMAND` and are NOT in
// this table — they have no CSS-declaration round-trip. The paired
// `-webkit-text-stroke-*` outline (DR-060) is likewise handled by the bridge's
// dedicated outline writer because color + width must be written together.

import type { TextCase } from "@agocraft/core";
import type { WeaveRunStyle } from "./types.js";

/** A per-range style property whose run attribute maps to a single inline CSS
 *  declaration on the Lexical TextNode. */
export interface RangeStyleProp {
  /** Run-attribute key on `WeaveRunStyle` (= a `PartialTextStyle` field). */
  readonly attrKey: keyof WeaveRunStyle;
  /** The CSS property name written to the node style / read back from it. */
  readonly cssProp: string;
  /** Attr value → CSS declaration value. `null` clears the declaration. */
  toCss(value: unknown): string | null;
  /** CSS declaration value → attr value. `undefined` = absent / unparseable. */
  fromCss(css: string): string | number | undefined;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}
function readString(css: string): string | undefined {
  const s = css.trim();
  return s.length > 0 ? s : undefined;
}
function pxToCss(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? `${v}px` : null;
}
function readPx(css: string): number | undefined {
  const n = Number.parseFloat(css);
  return Number.isNaN(n) ? undefined : n;
}

// textCase ↔ CSS text-transform. ORIGINAL / SMALL_CAPS have no plain
// text-transform mapping (ORIGINAL = no transform; SMALL_CAPS is font-variant),
// so they clear the per-range declaration — the whole-item base then applies.
const CASE_TO_CSS: Readonly<Record<string, string>> = {
  UPPER: "uppercase",
  LOWER: "lowercase",
  TITLE: "capitalize",
};
const CSS_TO_CASE: Readonly<Record<string, TextCase>> = {
  uppercase: "UPPER",
  lowercase: "LOWER",
  capitalize: "TITLE",
};

/** The registry. Order is irrelevant — every consumer iterates the whole set. */
export const RANGE_STYLE_PROPS: ReadonlyArray<RangeStyleProp> = [
  {
    attrKey: "color",
    cssProp: "color",
    toCss: nonEmptyString,
    fromCss: readString,
  },
  {
    attrKey: "fontSize",
    cssProp: "font-size",
    toCss: (v) => (typeof v === "number" && v > 0 ? `${v}px` : null),
    fromCss: readPx,
  },
  {
    attrKey: "fontFamily",
    cssProp: "font-family",
    toCss: nonEmptyString,
    fromCss: readString,
  },
  {
    attrKey: "letterSpacing",
    cssProp: "letter-spacing",
    toCss: pxToCss,
    fromCss: readPx,
  },
  {
    attrKey: "textCase",
    cssProp: "text-transform",
    toCss: (v) => (typeof v === "string" ? (CASE_TO_CSS[v] ?? null) : null),
    fromCss: (css) => CSS_TO_CASE[css.trim().toLowerCase()],
  },
];

/** Lookup a descriptor by its run-attribute key (used by the toolbar to apply a
 *  single property). Returns undefined for keys not in the CSS table (format /
 *  outline keys are applied through their own writers). */
export function rangeStyleProp(attrKey: keyof WeaveRunStyle): RangeStyleProp | undefined {
  return RANGE_STYLE_PROPS.find((p) => p.attrKey === attrKey);
}
