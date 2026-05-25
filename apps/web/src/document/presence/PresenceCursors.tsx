// WI-028 Phase 4 — remote cursor overlay.
//
// Subscribes to a SyncEngine's PresenceChannel and renders one SVG
// arrow per remote actor at their broadcast `cursor` coordinates. Local
// actor is filtered out (Y.Awareness reports our own state too — we
// already see our native cursor).
//
// The host is responsible for translating local pointer events into
// `{ cursor: { x, y } }` on PresenceChannel.setLocal — see
// `usePresenceLocalCursor`.

import { colorForActor, type SyncEngine } from "@agocraft/sync";
import { useEffect, useState } from "react";

interface RemoteCursor {
  readonly actorId: string;
  readonly clientId: number;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

interface PresenceCursorsProps {
  readonly engine: SyncEngine;
  /** Optional projector: maps the design-space coords stored in presence
   *  (the unit the broadcaster used) into the SVG's pixel space. Hosts
   *  whose plane is scaled or letterboxed inside the cursor overlay
   *  supply this; identity callers can omit it. Returning `null` skips
   *  rendering that cursor for this tick (e.g., off-screen). */
  readonly project?: (
    designX: number,
    designY: number,
  ) => { readonly x: number; readonly y: number } | null;
}

export function PresenceCursors({ engine, project }: PresenceCursorsProps): JSX.Element | null {
  const [cursors, setCursors] = useState<ReadonlyArray<RemoteCursor>>([]);

  useEffect(() => {
    return engine.presence.subscribe((entries) => {
      const out: RemoteCursor[] = [];
      for (const entry of entries) {
        if (entry.actorId === engine.actorId) continue;
        const c = (entry.state as { cursor?: { x?: number; y?: number } }).cursor;
        if (c === undefined || typeof c.x !== "number" || typeof c.y !== "number") {
          continue;
        }
        const projected = project ? project(c.x, c.y) : { x: c.x, y: c.y };
        if (projected === null) continue;
        out.push({
          actorId: entry.actorId ?? `client-${entry.clientId}`,
          clientId: entry.clientId,
          x: projected.x,
          y: projected.y,
          color: colorForActor(entry.actorId ?? String(entry.clientId)),
        });
      }
      setCursors(out);
    });
  }, [engine, project]);

  if (cursors.length === 0) return null;
  return (
    <svg
      aria-hidden="true"
      role="presentation"
      className="pointer-events-none absolute inset-0"
      style={{ overflow: "visible" }}
      data-testid="presence-cursors"
    >
      <title>Collaborator cursors</title>
      {cursors.map((c) => (
        <g key={c.clientId} transform={`translate(${c.x},${c.y})`}>
          <path
            d="M0 0 L0 18 L5 13 L8 20 L11 19 L8 12 L15 12 Z"
            fill={c.color}
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={0.8}
          />
          <text
            x={18}
            y={16}
            fontSize={11}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill={c.color}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={0.3}
          >
            {c.actorId.slice(0, 10)}
          </text>
        </g>
      ))}
    </svg>
  );
}
