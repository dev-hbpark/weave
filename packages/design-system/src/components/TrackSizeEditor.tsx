// DR-design-019 — TrackSizeEditor (list editor primitive for AutoGridSpec
// columns / rows). Discriminated union per row: { kind: "ratio" | "fr" |
// "auto", value? }. Add / remove rows; keyboard-navigable; ARIA list +
// listitem semantics; no drag-reorder in v1.1 (DR-019 future PR).
//
// Tree-shake: ESM, sideEffects:false, no decorators, named const exports.

import { forwardRef } from "react";
import { cn } from "../cn.js";
import { Button } from "./Button.js";
import { IconClose } from "./Icon.js";
import { NumberSlider } from "./NumberSlider.js";
import { SegmentedControl } from "./SegmentedControl.js";

/** TrackSize variant. Mirror of `@agocraft/core` TrackSize — kept structural
 *  here to avoid the design-system depending on @agocraft/core. */
export type TrackSize =
  | { readonly kind: "ratio"; readonly value: number }
  | { readonly kind: "fr"; readonly value: number }
  | { readonly kind: "auto" };

export interface TrackSizeEditorProps {
  readonly value: ReadonlyArray<TrackSize>;
  readonly onValueChange: (next: ReadonlyArray<TrackSize>) => void;
  readonly "aria-label"?: string;
  /** Minimum rows the editor enforces. Remove button disabled at this
   *  count. Default 1 (matches AutoGridSpec semantic — at least one
   *  track). */
  readonly minRows?: number;
  /** Maximum rows. Add button disabled at this count. Default 20 (sanity
   *  cap; the algorithm scales to higher counts but the UI degrades). */
  readonly maxRows?: number;
  readonly className?: string;
}

type TrackKind = TrackSize["kind"];

const KIND_OPTIONS: ReadonlyArray<{ value: TrackKind; label: string }> = [
  { value: "ratio", label: "Ratio" },
  { value: "fr", label: "Fr" },
  { value: "auto", label: "Auto" },
];

/** Default value when the user adds a new track (or switches kind). */
function defaultValueForKind(kind: TrackKind): TrackSize {
  if (kind === "ratio") return { kind: "ratio", value: 0.25 };
  if (kind === "fr") return { kind: "fr", value: 1 };
  return { kind: "auto" };
}

/** Replace one row in the immutable array (functional update). */
function replaceAt(
  arr: ReadonlyArray<TrackSize>,
  index: number,
  next: TrackSize,
): ReadonlyArray<TrackSize> {
  const out = arr.slice();
  out[index] = next;
  return out;
}

/** Remove one row by index. */
function removeAt(arr: ReadonlyArray<TrackSize>, index: number): ReadonlyArray<TrackSize> {
  const out = arr.slice();
  out.splice(index, 1);
  return out;
}

export const TrackSizeEditor = forwardRef<HTMLDivElement, TrackSizeEditorProps>(
  function TrackSizeEditor(
    {
      value,
      onValueChange,
      "aria-label": ariaLabel,
      minRows = 1,
      maxRows = 20,
      className,
    },
    ref,
  ) {
    const canRemove = value.length > minRows;
    const canAdd = value.length < maxRows;

    return (
      <div
        ref={ref}
        data-testid="track-size-editor"
        className={cn("flex flex-col gap-1.5", className)}
        {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      >
        <div role="list" className="flex flex-col gap-1">
          {value.map((track, index) => {
            const key = `${index}-${track.kind}`;
            const onKindChange = (nextKind: TrackKind) => {
              if (nextKind === track.kind) return;
              onValueChange(replaceAt(value, index, defaultValueForKind(nextKind)));
            };
            const onValueOnlyChange = (next: number) => {
              if (track.kind === "auto") return;
              onValueChange(replaceAt(value, index, { kind: track.kind, value: next }));
            };
            const onRemove = () => {
              if (!canRemove) return;
              onValueChange(removeAt(value, index));
            };
            return (
              <div
                key={key}
                role="listitem"
                data-testid={`track-size-editor-row-${index}`}
                className="flex items-center gap-1.5"
              >
                <SegmentedControl<TrackKind>
                  value={track.kind}
                  onValueChange={onKindChange}
                  options={KIND_OPTIONS}
                  aria-label={`Track ${index + 1} kind`}
                  className="shrink-0"
                />
                {track.kind === "auto" ? (
                  <span className="flex-1 text-[11px] text-[color:var(--text-overlay-soft)] pl-2">
                    자동 크기
                  </span>
                ) : (
                  <NumberSlider
                    value={track.value}
                    onValueChange={onValueOnlyChange}
                    min={track.kind === "ratio" ? 0 : 0}
                    max={track.kind === "ratio" ? 1 : 12}
                    step={track.kind === "ratio" ? 0.005 : 0.5}
                    format={
                      track.kind === "ratio"
                        ? (v) => `${Math.round(v * 1000) / 10}%`
                        : (v) => `${v}fr`
                    }
                    aria-label={`Track ${index + 1} value`}
                    className="flex-1"
                  />
                )}
                <Button
                  variant="subtle"
                  size="md"
                  onClick={onRemove}
                  disabled={!canRemove}
                  aria-label={`Remove track ${index + 1}`}
                  data-testid={`track-size-editor-remove-${index}`}
                  className="shrink-0"
                >
                  <IconClose size={12} />
                </Button>
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="md"
          disabled={!canAdd}
          onClick={() => {
            if (!canAdd) return;
            onValueChange([...value, defaultValueForKind("fr")]);
          }}
          aria-label="Add track"
          data-testid="track-size-editor-add"
          className="w-full justify-center"
        >
          + Add
        </Button>
      </div>
    );
  },
);
