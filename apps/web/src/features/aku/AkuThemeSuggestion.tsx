// Aku theme suggestion — when "테마 추천" is on, the agent ends its reply with a
// `추천 테마: <이름>` line. We parse the latest assistant message for it and offer
// a one-click apply (sets the live editor theme via the design-system hook).

import { isThemeName, THEMES, useTheme } from "@weave/design-system";
import { useMemo } from "react";
import type { AkuMessage } from "./types.js";

/** Pull a `추천 테마: <name>` recommendation from the newest assistant message,
 *  validated against the real theme names. Null when absent / invalid. */
function parseRecommendedTheme(messages: ReadonlyArray<AkuMessage>): string | null {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant === undefined || lastAssistant.text === "") return null;
  const m = lastAssistant.text.match(/추천\s*테마\s*[:：]\s*([A-Za-z가-힣][\w가-힣-]*)/);
  const raw = m?.[1]?.trim();
  if (raw === undefined) return null;
  // The instruction lists theme NAMES; accept an exact (case-insensitive) match.
  const hit = THEMES.find((t) => t.name.toLowerCase() === raw.toLowerCase());
  return hit !== undefined && isThemeName(hit.name) ? hit.name : null;
}

export function AkuThemeSuggestion({
  messages,
  enabled,
}: {
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly enabled: boolean;
}): JSX.Element | null {
  const { theme, setTheme } = useTheme();
  const recommended = useMemo(
    () => (enabled ? parseRecommendedTheme(messages) : null),
    [enabled, messages],
  );
  if (recommended === null || recommended === theme) return null;
  const label = THEMES.find((t) => t.name === recommended)?.label ?? recommended;
  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--surface-2-border)] bg-[color:var(--surface-2)] px-2 py-1.5"
      data-testid="aku-theme-suggestion"
    >
      <span className="flex-1 text-[11px] text-[color:var(--text-soft)]">
        추천 테마: <span className="text-[color:var(--text-strong)]">{label}</span>
      </span>
      <button
        type="button"
        onClick={() => setTheme(recommended as never)}
        data-testid="aku-theme-apply"
        className="shrink-0 rounded-full bg-[color:var(--accent)] px-2.5 py-0.5 text-[11px] text-[color:var(--text-on-accent)] hover:opacity-90"
      >
        적용
      </button>
    </div>
  );
}
