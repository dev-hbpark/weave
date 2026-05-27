import { ContextualToolbar as Bar, Button, ColorPicker } from "@weave/design-system";
import {
  isMixed,
  MixedBadge,
  pickerValueToStored,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

/** Shared section for the four domain frames (slide / canvas-design /
 *  block-doc / media). Edits a single attr — `attrs.background` — with
 *  the same multi-aware ColorPicker pattern. The attr is undefined when
 *  the frame is transparent; the "×" button clears back to undefined. */
export const FrameBackgroundSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  // WI-040 — `attrs.background` may be a `StyleRef` (theme token) after
  // the user picked a theme swatch. `useResolveSharedColor` runs the
  // cascade walker per item before comparing values, so the picker sees
  // a CSS string and "Mixed" detection works on semantic equality.
  const background = useResolveSharedColor(
    items,
    (it) => (it.attrs as unknown as { background?: unknown }).background,
  );
  const bgHasValue = !isMixed(background) && background !== undefined;
  return (
    <Bar.Section label="Background" priority={100}>
      <div className="inline-flex items-center gap-1.5">
        <ColorPicker
          value={isMixed(background) ? "#cccccc" : (background ?? "#ffffff")}
          onValueCommit={(v) =>
            updateAll(editor, ids, (prev) => ({
              attrs: {
                ...prev.attrs,
                background: pickerValueToStored(v),
              } as unknown as Readonly<Record<string, unknown>>,
            }))
          }
          onValueChange={() => {
            /* commit-only */
          }}
        />
        <MixedBadge visible={isMixed(background)} />
        {bgHasValue ? (
          <Button
            variant="subtle"
            size="md"
            onClick={() =>
              updateAll(editor, ids, (prev) => {
                const next = { ...prev.attrs } as Record<string, unknown>;
                delete next.background;
                return {
                  attrs: next as Readonly<Record<string, unknown>>,
                };
              })
            }
            data-testid="frame-bg-clear"
            aria-label="배경 비우기"
            title="배경 비우기 (투명)"
          >
            ×
          </Button>
        ) : null}
      </div>
    </Bar.Section>
  );
};
