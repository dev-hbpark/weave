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

  const mood: AkuMood = resolveAkuMood({
    status,
    connectionState: connection.state,
    activity: liveActivity,
    celebrate,
    looking,
    sleeping,
  });

  return { mood, intensity: moodIntensity(mood), caption };
}
