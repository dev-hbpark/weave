// WI-240 Phase 2 — resolve the relay base URL.
//
// Prefer an explicit `VITE_WEAVE_RELAY_URL`; otherwise derive from the Aku
// agent URL (same small-think tunnel, `/relay` path — DR-155). Returns null
// when neither is configured, which disables the live-session UI.

function envStr(key: string): string | undefined {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** `null` when no relay is configured (live session unavailable). */
export function resolveRelayUrl(): string | null {
  const explicit = envStr("VITE_WEAVE_RELAY_URL");
  if (explicit !== undefined) return explicit;
  const aku = envStr("VITE_AKU_AGENT_URL");
  if (aku === undefined) return null;
  try {
    const u = new URL(aku);
    u.pathname = "/relay";
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
