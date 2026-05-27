// TooltipCard — shared visual unit for context + actions + kbd shortcut.
//
// Three sibling surfaces (AITooltip Floating, CursorTooltip, EmptySpaceHint)
// were each re-implementing the same card body. Centralising here so the
// "Context" eyebrow + action list + keycap chrome stay identical across the
// app and a token tweak ripples to all three.
//
// This primitive is layout/positioning-agnostic: callers handle portaling +
// anchoring (target rect / cursor virtual ref / popover anchor). We only own
// what's inside the card.

import type { ReactElement, ReactNode } from "react";
import { cn } from "../cn.js";
import type { AITooltipAction, AITooltipHotkeyTable } from "./AITooltip.js";

export interface TooltipCardProps {
  /** One-line label rendered under the "Context" eyebrow. Omit to skip the
   *  context block (useful for action-only cards). */
  readonly context?: string;
  /** Optional eyebrow override (defaults to "Context"). EmptySpaceHint uses
   *  the insertable's category name here. */
  readonly eyebrow?: string;
  /** Action rows. Each row resolves its keycap via literal `shortcut`
   *  first, then `hotkeyId` looked up in `hotkeyTable`. */
  readonly actions?: ReadonlyArray<AITooltipAction>;
  /** Hotkey display table. AITooltip provider holds the canonical instance;
   *  CursorTooltip passes through the same reference. */
  readonly hotkeyTable?: AITooltipHotkeyTable;
  /** Optional trailing block — used by EmptySpaceHint to render the
   *  "kinds" pill row beneath the action list. */
  readonly footer?: ReactNode;
}

export function TooltipCard({
  context,
  eyebrow = "Context",
  actions,
  hotkeyTable,
  footer,
}: TooltipCardProps): ReactElement {
  const hasContext = context !== undefined && context.length > 0;
  const hasActions = (actions?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-1 min-w-[180px] max-w-[320px]">
      {hasContext ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-overlay-soft)]">
            {eyebrow}
          </span>
          <span className="text-[13px] text-[color:var(--text-overlay)]">{context}</span>
        </div>
      ) : null}
      {hasContext && hasActions ? (
        <div aria-hidden className="my-1.5 h-px bg-[color:var(--surface-overlay-border)]" />
      ) : null}
      {hasActions && actions !== undefined ? (
        <ul className="flex flex-col gap-1.5 text-[13px]">
          {actions.map((a, i) => {
            const resolvedShortcut =
              a.shortcut ?? (a.hotkeyId !== undefined ? hotkeyTable?.[a.hotkeyId]?.keys : undefined);
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: action label can legitimately repeat
                key={`${i}-${a.action}`}
                className="flex items-center gap-2 text-[color:var(--text-overlay)]"
              >
                <span aria-hidden className="text-[color:var(--accent-strong)]">
                  ▸
                </span>
                <span className="flex-1">{a.action}</span>
                {resolvedShortcut !== undefined ? (
                  <kbd
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5",
                      "rounded-[var(--radius-sm)] border",
                      "bg-[color:var(--surface-overlay-2)] border-[color:var(--surface-overlay-border-strong)]",
                      "text-[11px] font-mono tracking-[0.04em] text-[color:var(--text-overlay)]",
                    )}
                  >
                    {resolvedShortcut}
                  </kbd>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {footer !== undefined ? footer : null}
    </div>
  );
}
