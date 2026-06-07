// 아쿠 expression — subscribe hook (WI-103 / DR-070 D4).
//
// Subscribes to the agent run-state the UI ALREADY has (status / connection /
// the live `activity` caption / selection) and derives {mood, intensity} + a
// live work caption. The producer (useAkuAgent) is untouched — this is a pure
// consumer (Information Expert). It owns two transient, timer-driven windows
// that the raw signal can't express on its own:
//   - celebrate: a turn just settled with applied edits (a short ✨ window),
//   - looking:   the selection changed while idle (a brief perk-up).
// Consumers choose their own scheduling — here, timers — never pushed onto the
// producer (workspace producer/consumer rule).
//
// `sleeping` (the long-quiet doze) is NOT owned here — it's driven by real
// pointer/keyboard editing activity, which only useAkuRoam observes (WI-111). It
// is injected so the mood RULE TABLE remains the single arbiter of mood priority
// (streaming/celebrate outrank doze).
//
// This file imports NO concrete renderer (renderer seam purity, DR-070 D2) — the
// deps-guard test enforces it.

import { useEffect, useRef, useState } from "react";
import type { AkuConnection, AkuMessage, AkuStatus } from "../types.js";
import { type AkuMood, moodIntensity, resolveAkuMood } from "./mood.js";
import { pickPhrase } from "./phrases.js";
import type { AkuExpressionState } from "./renderer-types.js";

// Turn-end finale window (WI-135): a quick grow/glide to centre (~400ms) + 2 loops of
// the 짜잔~ tada cast (6 frames @ 6fps = 1s/loop). Aku returns to idle when it ends.
const CELEBRATE_MS = 2400;
const LOOKING_MS = 1400;
// Minimum time a per-operation edit mood stays on screen (WI-118). Agent tools
// settle in milliseconds, so the edit casts (adding/updating/working/finalizing)
// can flip faster than the sprite can render; hold each for at least this long
// before switching to ANOTHER edit mood. Switches to/from non-edit moods
// (thinking/idle/…) are immediate so reasoning reads instantly.
const EDIT_HOLD_MS = 700;
// finalizing(puff) is now one of the edit casts (WI-124): it stopped being a wrap-up
// indicator when the "정리 중…" caption was retired, so it joins the random spell pool
// below and gets the same min-hold as the other casts instead of flashing sub-frame.
const EDIT_MOODS: ReadonlySet<AkuMood> = new Set([
  "adding",
  "updating",
  "working",
  "finalizing",
  "painting",
]);
// "idea situations" — generic edits (`working`) show one of the spell casts at RANDOM
// instead of idle (WI-119; WI-124 added puff). `celebrating` was here too, but WI-135
// gives the turn-end finale its own 짜잔~ tada sprite, so it's no longer remapped.
// One pick per entry, held stable.
const IDEA_MOODS: ReadonlySet<AkuMood> = new Set(["working"]);
// The random spell-cast pool for idea situations: spell-right (adding), spell-left
// (updating), puff (finalizing), paint brush (painting) — all play during edit
// actions (WI-124, +paint WI-129).
const SPELL_CASTS: readonly AkuMood[] = ["adding", "updating", "finalizing", "painting"];

export interface AkuExpression extends AkuExpressionState {
  /** Live caption to show above the collapsed launcher while a turn streams
   *  (null when idle). Turn-bound → not a proactive nag (DR-070 D5). */
  readonly caption: string | null;
}

export function useAkuExpression(input: {
  readonly status: AkuStatus;
  readonly connection: AkuConnection;
  readonly messages: readonly AkuMessage[];
  /** Stable join of selected ids — a change drives the `looking` window. */
  readonly selectionKey: string;
  /** Long-quiet doze, owned by useAkuRoam (real edit-activity driven, WI-111). */
  readonly sleeping: boolean;
}): AkuExpression {
  const { status, connection, messages, selectionKey, sleeping } = input;

  // The streaming assistant message's TECHNICAL `activity` (e.g. "○○ 적용 중…"). The
  // launcher 말풍선 is DECORATIVE (the panel carries the real status), so it now prefers
  // the playful mood PHRASE (built below) — WI-130 wires the DR-070 D5 phrase layer that
  // was never connected. `activity` is kept only as a fallback for a mood without phrases.
  const last = messages[messages.length - 1];
  const liveActivity =
    status === "streaming" && last?.role === "assistant" ? (last.activity ?? null) : null;

  const [celebrate, setCelebrate] = useState(false);
  const [looking, setLooking] = useState(false);

  // celebrate: fire when a turn transitions streaming → settled WITH edits.
  const prevStatus = useRef<AkuStatus>(status);
  useEffect(() => {
    const wasStreaming = prevStatus.current === "streaming";
    prevStatus.current = status;
    if (!(wasStreaming && status === "idle")) return;
    const settled = last?.role === "assistant" ? last : undefined;
    const earned = settled !== undefined && !settled.error && (settled.edits?.length ?? 0) > 0;
    if (!earned) return;
    setCelebrate(true);
    const t = setTimeout(() => setCelebrate(false), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [status, last]);

  // looking: a brief perk-up whenever the selection changes (only meaningful
  // while idle — resolveAkuMood ranks live work above it).
  const firstSel = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectionKey is the intentional TRIGGER (the effect fires a perk-up whenever selection changes), not a value read in the body.
  useEffect(() => {
    if (firstSel.current) {
      firstSel.current = false;
      return;
    }
    setLooking(true);
    const t = setTimeout(() => setLooking(false), LOOKING_MS);
    return () => clearTimeout(t);
  }, [selectionKey]);

  const raw: AkuMood = resolveAkuMood({
    status,
    connectionState: connection.state,
    activity: liveActivity,
    celebrate,
    looking,
    sleeping,
  });

  // Minimum-hold latch (+ idea→random-spell remap). Keeps an edit mood on screen
  // ≥ EDIT_HOLD_MS before swapping to a DIFFERENT edit mood (so fast tool bursts
  // render instead of flashing sub-frame), and substitutes a random spell cast for
  // "idea situations" (working/celebrating). Non-edit transitions switch instantly.
  const [mood, setMood] = useState<AkuMood>(raw);
  const heldAt = useRef(Date.now());
  const spell = useRef<AkuMood>("adding");
  const prevIdea = useRef(false);
  useEffect(() => {
    const isIdea = IDEA_MOODS.has(raw);
    if (isIdea && !prevIdea.current) {
      // fresh entry into an idea situation → re-roll which spell to cast
      // (three casts now: spell-right / spell-left / puff — WI-124)
      spell.current = SPELL_CASTS[Math.floor(Math.random() * SPELL_CASTS.length)] ?? "adding";
    }
    prevIdea.current = isIdea;
    const desired = isIdea ? spell.current : raw;

    if (desired === mood) return;
    const now = Date.now();
    if (EDIT_MOODS.has(desired) && EDIT_MOODS.has(mood)) {
      const remaining = EDIT_HOLD_MS - (now - heldAt.current);
      if (remaining > 0) {
        const t = setTimeout(() => {
          setMood(desired);
          heldAt.current = Date.now();
        }, remaining);
        return () => clearTimeout(t);
      }
    }
    setMood(desired);
    heldAt.current = now;
  }, [raw, mood]);

  // Mood → phrase 말풍선 (WI-130). pickPhrase is deterministic (seeded by a per-mood-entry
  // counter, NOT Math.random → SSR/test-stable). Re-pick on every mood change so each
  // phase gets its own line and repeated entries cycle the list. The phrase is keyed on
  // the displayed `mood`, so it stays coherent with the sprite (e.g. spell-right →
  // "여기 딱 넣을게요!"). The 5 phrase moods cover thinking + every edit cast.
  const [phrase, setPhrase] = useState<string | null>(null);
  const phraseSeed = useRef(0);
  useEffect(() => {
    phraseSeed.current += 1;
    setPhrase(pickPhrase(mood, phraseSeed.current));
  }, [mood]);

  // Caption priority: a live connection banner (reconnect / error) is REAL, actionable
  // status → it outranks everything. Then the playful phrase, but ONLY while a turn is
  // active or during the celebrate window (turn/event-bound, never an idle nag — the idle
  // tip cadence stays owned by useAkuTips). Then the technical activity as a last resort.
  // Null while idle → the launcher falls back to the idle tip / Zzz hint in AkuAssistant.
  const turnBound = status === "streaming" || celebrate;
  const caption = connection.banner ?? (turnBound ? phrase : null) ?? liveActivity;

  return { mood, intensity: moodIntensity(mood), caption };
}
