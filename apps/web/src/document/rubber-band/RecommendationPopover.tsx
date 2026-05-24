// WI-017 Phase E — RecommendationPopover content body.
//
// Renders the recommendation list inside a `<PopoverContent>`. Hover fires
// `onHover(rec.id)` so the parent's RubberBand shows the skeleton preview;
// hover-out fires `onHover(null)`. Click commits.
//
// Not a design-system primitive — domain-specific layout (icon + label +
// description column) lives in apps/web. The Popover surface itself is the
// design-system primitive; this is content composition.

import { cn } from "@weave/design-system";
import { type ReactElement } from "react";
import type { InsertableRecommendation } from "../insertable/types.js";

export interface RecommendationPopoverProps {
  readonly recommendations: ReadonlyArray<InsertableRecommendation>;
  readonly onHover: (recId: string | null) => void;
  readonly onSelect: (recId: string) => void;
}

export function RecommendationPopover({
  recommendations,
  onHover,
  onSelect,
}: RecommendationPopoverProps): ReactElement {
  if (recommendations.length === 0) {
    return (
      <div
        data-testid="rubber-band-popover-empty"
        className="px-2 py-2.5 text-[12px] text-[color:var(--text-overlay-soft)]"
      >
        이 비율에 어울리는 추천이 없습니다
      </div>
    );
  }
  return (
    <ul
      data-testid="rubber-band-popover-list"
      role="listbox"
      aria-label="비율 기반 추천"
      className="flex flex-col gap-0.5 min-w-[220px]"
    >
      {recommendations.map((rec) => (
        <li key={rec.id} role="presentation">
          <button
            type="button"
            role="option"
            data-testid={`rubber-band-popover-item-${rec.id}`}
            aria-selected={false}
            onPointerEnter={() => onHover(rec.id)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(rec.id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(rec.id)}
            className={cn(
              "w-full flex items-start gap-2.5 text-left",
              "px-2.5 py-2 rounded-[var(--radius-sm)]",
              "outline-none cursor-pointer select-none",
              "hover:bg-[color:var(--surface-overlay-2)]",
              "focus-visible:bg-[color:var(--surface-overlay-2)]",
              "focus-visible:shadow-[var(--focus-ring)]",
              "transition-[background] duration-[var(--motion-quick)] ease-[var(--motion-spring-soft)]",
            )}
          >
            {rec.icon !== undefined ? (
              <span
                aria-hidden
                className="mt-0.5 inline-flex w-4 h-4 items-center justify-center text-[color:var(--text-overlay-soft)]"
              >
                {rec.icon}
              </span>
            ) : null}
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-[color:var(--text-overlay)]">
                {rec.label}
              </span>
              {rec.description !== undefined ? (
                <span className="block mt-0.5 text-[11px] text-[color:var(--text-overlay-soft)] leading-snug">
                  {rec.description}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
