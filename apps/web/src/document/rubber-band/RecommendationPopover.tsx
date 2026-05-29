// WI-017 Phase E + WI-020 / WI-043 — RecommendationPopover content body.
//
// Renders the recommendation list inside a `<PopoverContent>`. Hover fires
// `onHover(rec.id)` so the parent's RubberBand shows the skeleton preview;
// hover-out fires `onHover(null)`. Click commits.
//
// WI-020 / WI-043 A3 toggle — when `showLayoutTypeToggle` is true, the
// popover renders a small 3-button SegmentedControl above the
// recommendation list. The selected value flows back via
// `onLayoutTypeChange` and the wrapping layer forwards it into
// `InsertableCommitContext.layoutType` on commit.
//
// Not a design-system primitive — domain-specific layout (icon + label +
// description column) lives in apps/web. The Popover surface itself is the
// design-system primitive; this is content composition.

import { cn, IconLayoutAbsolute, IconLayoutFlex, IconLayoutGrid } from "@weave/design-system";
import type { ReactElement } from "react";
import type { InsertableRecommendation, LayoutTypeChoice } from "../insertable/types.js";

export interface RecommendationPopoverProps {
  readonly recommendations: ReadonlyArray<InsertableRecommendation>;
  readonly onHover: (recId: string | null) => void;
  readonly onSelect: (recId: string) => void;
  /** WI-020 / WI-043 — render the layout-type toggle above the list. */
  readonly showLayoutTypeToggle?: boolean;
  /** Current layout-type toggle selection. Required when
   *  `showLayoutTypeToggle` is true. */
  readonly layoutType?: LayoutTypeChoice;
  /** Selection callback. Required when `showLayoutTypeToggle` is true. */
  readonly onLayoutTypeChange?: (next: LayoutTypeChoice) => void;
}

const LAYOUT_TYPE_OPTIONS: ReadonlyArray<{
  readonly value: LayoutTypeChoice;
  readonly label: string;
  readonly Icon: typeof IconLayoutAbsolute;
}> = [
  { value: "absolute", label: "Absolute", Icon: IconLayoutAbsolute },
  { value: "auto-flex", label: "Flex", Icon: IconLayoutFlex },
  { value: "auto-grid", label: "Grid", Icon: IconLayoutGrid },
];

function LayoutTypeToggle({
  value,
  onChange,
}: {
  readonly value: LayoutTypeChoice;
  readonly onChange: (next: LayoutTypeChoice) => void;
}): ReactElement {
  return (
    <div
      data-testid="rubber-band-popover-layout-toggle"
      role="radiogroup"
      aria-label="레이아웃 타입"
      className={cn(
        "flex items-center gap-1 px-2 py-1.5",
        "border-b border-[color:var(--border-overlay)]",
      )}
    >
      <span className="text-[11px] text-[color:var(--text-overlay-soft)] mr-1">레이아웃</span>
      {LAYOUT_TYPE_OPTIONS.map(({ value: v, label, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`rubber-band-popover-layout-${v}`}
            data-active={active ? "true" : undefined}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5",
              "rounded-[var(--radius-xs)] text-[11px]",
              "outline-none cursor-pointer",
              active
                ? "bg-[color:var(--surface-overlay-2)] text-[color:var(--text-overlay)]"
                : "text-[color:var(--text-overlay-soft)] hover:bg-[color:var(--surface-overlay-2)]",
              "focus-visible:shadow-[var(--focus-ring)]",
              "transition-[background] duration-[var(--motion-quick)] ease-[var(--motion-spring-soft)]",
            )}
          >
            <Icon size={14} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RecommendationPopover({
  recommendations,
  onHover,
  onSelect,
  showLayoutTypeToggle,
  layoutType,
  onLayoutTypeChange,
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
    <div className="flex flex-col min-w-[220px]">
      {showLayoutTypeToggle === true &&
      layoutType !== undefined &&
      onLayoutTypeChange !== undefined ? (
        <LayoutTypeToggle value={layoutType} onChange={onLayoutTypeChange} />
      ) : null}
      <ul
        data-testid="rubber-band-popover-list"
        role="listbox"
        aria-label="비율 기반 추천"
        className="flex flex-col gap-0.5"
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
    </div>
  );
}
