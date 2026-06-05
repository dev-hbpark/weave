// 아쿠 expression — Phase 1 renderer (WI-103 / DR-070 D1).
//
// No new dependency. Mood → a CSS class on an inner wrapper that animates the
// existing mascot PNG. Two animation registers (FR-020):
//   - continuous motion (bob / tilt / squash / wobble) → TRANSFORM only
//     (compositor-cheap, RPR-pure);
//   - discrete frames (blink / mouth / pose) → CSS sprite `steps()` — wired in
//     main.css and activated only once a real sprite-sheet asset lands
//     (DR-design-024). With today's single placeholder PNG, mood reads via the
//     transform register + a small decorative glyph.
// Everything is reduced-motion safe (main.css disables the keyframes under
// prefers-reduced-motion: reduce). data-mood is the e2e hook.

import { AkuMascot } from "../AkuMascot.js";
import type { AkuMood } from "./mood.js";
import type { AkuExpressionRenderer, AkuExpressionState } from "./renderer-types.js";

// A tiny decorative glyph that disambiguates moods the single placeholder PNG
// can't yet express on its own. Removed once per-pose sprite art arrives.
const MOOD_GLYPH: Partial<Record<AkuMood, string>> = {
  thinking: "…",
  sleeping: "z",
  celebrating: "✨",
  confused: "?",
};

function MascotForMood({ mood, intensity }: AkuExpressionState): JSX.Element {
  const glyph = MOOD_GLYPH[mood];
  return (
    <span
      data-mood={mood}
      className={`aku-expr aku-expr--${mood} relative block w-full h-full`}
      style={{ ["--aku-intensity" as string]: String(intensity) }}
    >
      <AkuMascot
        variant="mark"
        className="w-full h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
      />
      {glyph !== undefined ? (
        <span aria-hidden="true" className="aku-expr-glyph" data-glyph={mood}>
          {glyph}
        </span>
      ) : null}
    </span>
  );
}

export function createCssSpriteRenderer(): AkuExpressionRenderer {
  return {
    render: (state) => <MascotForMood mood={state.mood} intensity={state.intensity} />,
  };
}

/** The default Phase 1 renderer instance (composition root wires it). */
export const cssSpriteRenderer = createCssSpriteRenderer();
