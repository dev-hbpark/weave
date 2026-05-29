// Aku tip speech-bubble (WI-053) — the floating mascot's contextual tip. Built
// on the design-system `Popover` (Radix: collision flipping, arrow, Esc/outside
// dismiss, a11y) anchored to the launcher. Controlled-open by `useAkuTips`.
// `aria-live="polite"` so screen readers get the tip without stealing focus.
// The Popover content is portaled to <body> (outside the launcher's bobbing
// inner span), so its surface is unaffected by the bob transform.

import {
  IconClose,
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
} from "@weave/design-system";
import type { ReactElement } from "react";
import { AkuMascot } from "./AkuMascot.js";

export function AkuTipBubble({
  tip,
  anchor,
  onDismiss,
  onDisableForever,
}: {
  readonly tip: string;
  readonly anchor: ReactElement;
  readonly onDismiss: () => void;
  readonly onDisableForever: () => void;
}): JSX.Element {
  return (
    <Popover
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent side="bottom" align="start" sideOffset={10} className="max-w-[264px]">
        <div
          aria-live="polite"
          data-aku-tip
          className="relative pr-5 text-[12px] leading-[1.5] text-[color:var(--text-default)]"
        >
          <div className="flex gap-2">
            <AkuMascot variant="full" className="shrink-0 w-7 h-7 -mt-0.5" />
            <p>{tip}</p>
          </div>
          <button
            type="button"
            aria-label="팁 닫기"
            data-aku-tip-close
            onClick={onDismiss}
            className="absolute -top-0.5 right-0 inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <IconClose size={12} />
          </button>
          <button
            type="button"
            data-aku-tip-off
            onClick={onDisableForever}
            className="mt-2 text-[11px] text-[color:var(--text-soft)] underline underline-offset-2 hover:text-[color:var(--text-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            그만 보기
          </button>
        </div>
        <PopoverArrow />
      </PopoverContent>
    </Popover>
  );
}
