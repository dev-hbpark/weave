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
import type { AkuExpressionState } from "./renderer-types.js";

const CELEBRATE_MS = 1800;
const LOOKING_MS = 1400;
// Minimum time a per-operation edit mood stays on screen (WI-118). Agent tools
// settle in milliseconds, so adding/updating/working can flip faster than the
// sprite can render; hold each for at least this long before switching to ANOTHER
// edit mood. Switches to/from non-edit moods (thinking/finalizing/idle/…) are
// immediate so reasoning + wrap-up still read instantly.
const EDIT_HOLD_MS = 700;
const EDIT_MOODS: ReadonlySet<AkuMood> = new Set(["adding", "updating", "working"]);
// "idea situations" — generic edits (`working`) and the completion ✨ (`celebrating`)
// used to all show idea.png. Operator: show one of the two spell casts at RANDOM
// instead (WI-119). One pick per entry into an idea situation, held stable.
const IDEA_MOODS: ReadonlySet<AkuMood> = new Set(["working", "celebrating"]);

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

  // The live caption is the streaming assistant message's `activity` (the agent
  // already wrote it there); fall back to the connection banner if attention is
  // needed. Cleared when the turn settles.
  const last = messages[messages.length - 1];
  const liveActivity =
    status === "streaming" && last?.role === "assistant" ? (last.activity ?? null) : null;
  const caption = liveActivity ?? connection.banner;

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
      spell.current = Math.random() < 0.5 ? "adding" : "updating";
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

  return { mood, intensity: moodIntensity(mood), caption };
}
