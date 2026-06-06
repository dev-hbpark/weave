// 아쿠 expression — state→mood registry (WI-103 / DR-070 D3).
//
// The agent's run-state already flows to the UI (status / connection / the live
// `activity` caption on the streaming assistant message — see types.ts). This
// module DERIVES a character mood from that signal; it generates NO new data
// (Information Expert: the agent hook owns the state, expression is a consumer).
//
// Rule 6 (루트 CLAUDE.md): the phase→mood decision is an ORDERED RULE TABLE
// (first match wins), never a `switch`/if-else chain on a phase string. Adding a
// mood = adding a row (OCP). The table also stays renderer-agnostic so the
// rendering tech (CSS sprite now, Rive later) can swap behind the seam without
// touching this file (DR-070 D2).

import type { AkuConnection, AkuStatus } from "../types.js";

/** The character's expressive state. Renderer-independent. */
export type AkuMood =
  | "idle"
  | "connecting"
  | "thinking"
  | "working"
  | "finalizing"
  | "celebrating"
  | "confused"
  | "sleeping"
  | "looking"
  | "dragging"; // UI-only (drag interaction) — not emitted by resolveAkuMood

/** Everything resolveAkuMood needs. `activity` is the live caption off the
 *  streaming assistant message (e.g. "생각 중…", "편집 적용 중: 배경색 변경").
 *  `celebrate`/`looking` are owned + timed by useAkuExpression; `sleeping` is
 *  injected from useAkuRoam (real edit-activity driven, WI-111). */
export interface AkuMoodInput {
  readonly status: AkuStatus;
  readonly connectionState: AkuConnection["state"];
  readonly activity: string | null;
  /** A turn just settled with applied edits — celebrate window (transient). */
  readonly celebrate: boolean;
  /** Selection changed recently while idle — perk-up window (transient). */
  readonly looking: boolean;
  /** No user editing for a long while — doze window (from useAkuRoam, WI-111). */
  readonly sleeping: boolean;
}

// The streaming `activity` caption is Korean and partly tool-authored
// ("배경색 변경 적용 중…"), so we key off stable substrings, not an enum we don't
// own. "생각" → reasoning, "정리" → wrapping up; everything else streaming = busy.
const THINKING_MARK = "생각";
const FINALIZING_MARK = "정리";

type Rule = readonly [predicate: (i: AkuMoodInput) => boolean, mood: AkuMood];

// Priority order matters: connection trouble and live work outrank idle moods.
const MOOD_RULES: readonly Rule[] = [
  [(i) => i.connectionState === "error" || i.connectionState === "closed", "confused"],
  [(i) => i.connectionState === "connecting" || i.connectionState === "reconnecting", "connecting"],
  [
    (i) => i.status === "streaming" && i.activity !== null && i.activity.includes(THINKING_MARK),
    "thinking",
  ],
  [
    (i) => i.status === "streaming" && i.activity !== null && i.activity.includes(FINALIZING_MARK),
    "finalizing",
  ],
  [(i) => i.status === "streaming", "working"],
  [(i) => i.celebrate, "celebrating"],
  [(i) => i.sleeping, "sleeping"],
  [(i) => i.looking, "looking"],
];

export function resolveAkuMood(input: AkuMoodInput): AkuMood {
  const hit = MOOD_RULES.find(([predicate]) => predicate(input));
  return hit ? hit[1] : "idle";
}

/** Animation vigor per mood (0..1) — renderers may map it to speed/amplitude.
 *  Kept here (not in a renderer) so every renderer agrees on relative energy. */
const MOOD_INTENSITY: Readonly<Record<AkuMood, number>> = {
  idle: 0.35,
  connecting: 0.7,
  thinking: 0.6,
  working: 0.95,
  finalizing: 0.55,
  celebrating: 1,
  confused: 0.7,
  sleeping: 0.2,
  looking: 0.7,
  dragging: 1,
};

export function moodIntensity(mood: AkuMood): number {
  return MOOD_INTENSITY[mood];
}
