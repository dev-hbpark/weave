// WI-240 Phase 2 — live-session controller (presenter-broadcast MVP).
//
// Ties the relay transport to a role:
//   • host   — publishes the Phase-1 session's mutations (PublishingSession
//              Decorator) + step changes.
//   • viewer — applies inbound messages to a RemoteInkSession + follows the
//              presenter's step; drawing disabled.
//   • off    — no connection; present behaves exactly as Phase 1.
//
// Connection is OPT-IN: a viewer joins only when the URL carries `?session=`,
// a host only on goLive(). The plain present path opens no socket (RISK-013 R7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InkSession } from "../use-ink-session.js";
import { createPublishingSession } from "./publishing-session.js";
import {
  createRelayTransport,
  type RelaySocketLike,
  type RelayStatus,
  type RelayTransport,
} from "./relay-transport.js";
import {
  decodeSessionMessage,
  dispatchSessionMessage,
  encodeSessionMessage,
  type SessionMessage,
} from "./session-message.js";
import { useRemoteInkSession } from "./use-remote-ink-session.js";

export type LiveRole = "off" | "host" | "viewer";

export interface UseLiveSessionArgs {
  readonly localSession: InkSession;
  readonly currentStep: number;
  readonly onFollowStep: (step: number) => void;
  /** Resolved relay base URL (e.g. `wss://host/relay`); null disables live. */
  readonly relayUrl: string | null;
  /** Test seam — inject a fake socket factory. */
  readonly createSocket?: (url: string) => RelaySocketLike;
}

export interface LiveSession {
  readonly role: LiveRole;
  readonly status: RelayStatus | "off";
  readonly roomId: string | null;
  readonly shareUrl: string | null;
  readonly session: InkSession;
  readonly canDraw: boolean;
  readonly available: boolean;
  goLive(): void;
  stopLive(): void;
}

function readSessionParam(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("session");
  return v !== null && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

function writeSessionParam(room: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (room === null) url.searchParams.delete("session");
  else url.searchParams.set("session", room);
  window.history.replaceState(window.history.state, "", url.toString());
}

function mintRoomId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `r${Date.now().toString(36)}`;
  return uuid.replace(/-/g, "").slice(0, 12);
}

export function useLiveSession({
  localSession,
  currentStep,
  onFollowStep,
  relayUrl,
  createSocket,
}: UseLiveSessionArgs): LiveSession {
  const remote = useRemoteInkSession();
  const [role, setRole] = useState<LiveRole>("off");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<RelayStatus | "off">("off");
  const transportRef = useRef<RelayTransport | null>(null);

  // Latest-value refs so the long-lived transport callbacks never go stale.
  const followRef = useRef(onFollowStep);
  followRef.current = onFollowStep;
  const remoteRef = useRef(remote);
  remoteRef.current = remote;

  const teardown = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
  }, []);

  const openTransport = useCallback(
    (room: string, asViewer: boolean) => {
      if (relayUrl === null) return;
      teardown();
      const t = createRelayTransport({
        url: relayUrl,
        room,
        ...(createSocket !== undefined ? { createSocket } : {}),
      });
      transportRef.current = t;
      t.onStatus(setStatus);
      setStatus(t.status());
      if (asViewer) {
        t.onMessage((text) => {
          const m = decodeSessionMessage(text);
          if (m === null) return;
          dispatchSessionMessage(m, {
            onStroke: (s, stroke) => remoteRef.current.applyStroke(s, stroke),
            onSync: (s, strokes) => remoteRef.current.applySync(s, strokes),
            onStep: (step) => followRef.current(step),
          });
        });
      }
    },
    [relayUrl, createSocket, teardown],
  );

  // Auto-join as viewer when the URL carries `?session=` (opt-in). The
  // `role !== "off"` guard makes this idempotent across the re-runs that the
  // role/openTransport deps trigger — it joins once, then short-circuits.
  useEffect(() => {
    if (role !== "off") return;
    const room = readSessionParam();
    if (room === null || relayUrl === null) return;
    setRole("viewer");
    setRoomId(room);
    openTransport(room, true);
  }, [relayUrl, role, openTransport]);

  // Tear the transport down on unmount.
  useEffect(() => () => teardown(), [teardown]);

  const publish = useCallback((m: SessionMessage) => {
    transportRef.current?.send(encodeSessionMessage(m));
  }, []);

  const goLive = useCallback(() => {
    if (relayUrl === null || role === "host") return;
    const room = mintRoomId();
    setRole("host");
    setRoomId(room);
    writeSessionParam(room);
    openTransport(room, false);
  }, [relayUrl, role, openTransport]);

  const stopLive = useCallback(() => {
    teardown();
    setRole("off");
    setRoomId(null);
    setStatus("off");
    writeSessionParam(null);
  }, [teardown]);

  // Host broadcasts its current step so viewers follow.
  useEffect(() => {
    if (role !== "host") return;
    publish({ t: "step", step: currentStep });
  }, [role, currentStep, publish]);

  const session = useMemo<InkSession>(() => {
    if (role === "host") return createPublishingSession(localSession, publish);
    if (role === "viewer") return remote;
    return localSession;
  }, [role, localSession, remote, publish]);

  const shareUrl = useMemo<string | null>(() => {
    if (roomId === null || typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    url.searchParams.set("session", roomId);
    return url.toString();
  }, [roomId]);

  return {
    role,
    status,
    roomId,
    shareUrl,
    session,
    canDraw: role !== "viewer",
    available: relayUrl !== null,
    goLive,
    stopLive,
  };
}
