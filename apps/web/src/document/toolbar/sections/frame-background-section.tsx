// DR-design-015 — frame kind in Tier-2 layout.
//
// Frame only has a single property today (Background), so it lives directly
// in `Bar.Quick` as a single color swatch + (optional) clear button. No
// `Bar.More` is mounted — the "더보기" button only renders when its
// children are truthy.

import {
  ContextualToolbar as Bar,
  Button,
  ColorPicker,
  IconClose,
  IconFrame,
} from "@weave/design-system";
import {
  isMixed,
  MixedBadge,
  pickerValueToStored,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

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
    <>
      <Bar.Kind icon={<IconFrame size={18} />} label="Frame" />
      <Bar.Quick>
        <div className="inline-flex items-center gap-1">
          <ColorPicker
            aria-label="Frame background"
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
              <IconClose size={14} />
            </Button>
          ) : null}
        </div>
      </Bar.Quick>
    </>
  );
};
