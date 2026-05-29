// Aku per-design conversation persistence (WI-053). Mirrors the
// `useAkuGeometry` localStorage pattern: a single JSON blob per design id, so
// reopening a design restores the transcript. Storage is best-effort — quota
// errors / private-mode are swallowed (the chat keeps working in-memory).
//
// Only the UI `messages` are persisted (not the provider-neutral wire): the
// undo stack resets on reload anyway, so live-only undo metadata is stripped,
// and oversize image data URLs are dropped from the stored copy to stay well
// under the ~5MB localStorage budget.

import type { AkuMessage } from "./transport/types.js";

const PREFIX = "weave.aku.conversation.";
const MAX_MESSAGES = 100;
/** Drop attached images larger than this from the *persisted* copy (they remain
 *  in the live session). A 256KB data URL is a generous thumbnail budget. */
const MAX_PERSISTED_IMAGE_CHARS = 256 * 1024;

function storageKey(designId: string): string {
  return `${PREFIX}${designId === "" ? "default" : designId}`;
}

function isMessage(v: unknown): v is AkuMessage {
  if (typeof v !== "object" || v === null) return false;
  const m = v as { role?: unknown; text?: unknown };
  return (m.role === "user" || m.role === "assistant") && typeof m.text === "string";
}

/** Strip live-only / oversize fields before writing to storage. */
function lighten(message: AkuMessage): AkuMessage {
  if (message.role === "assistant") {
    // historyDepthAfter / undoEntryCount are meaningless after reload.
    const { historyDepthAfter: _d, undoEntryCount: _c, ...rest } = message;
    return rest;
  }
  if (message.images === undefined || message.images.length === 0) return message;
  const kept = message.images.filter((img) => img.dataUrl.length <= MAX_PERSISTED_IMAGE_CHARS);
  if (kept.length === message.images.length) return message;
  return kept.length > 0
    ? { ...message, images: kept }
    : { role: "user", text: message.text, ...(message.at !== undefined ? { at: message.at } : {}) };
}

export function loadConversation(designId: string): ReadonlyArray<AkuMessage> {
  try {
    const raw = window.localStorage.getItem(storageKey(designId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMessage);
  } catch {
    return [];
  }
}

export function persistConversation(designId: string, messages: ReadonlyArray<AkuMessage>): void {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES).map(lighten);
    window.localStorage.setItem(storageKey(designId), JSON.stringify(trimmed));
  } catch {
    // quota exceeded / private mode — keep the in-memory conversation.
  }
}

export function clearConversation(designId: string): void {
  try {
    window.localStorage.removeItem(storageKey(designId));
  } catch {
    // ignore
  }
}
