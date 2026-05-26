import { ref as styleRef } from "@agocraft/core";
import { ContextualToolbar as Bar, Button, ColorPicker } from "@weave/design-system";
import { findItemDeep } from "../../agocraft-mirror.js";
import { resolveStoredColor } from "../../style/resolver.js";
import { useDocumentForResolution } from "../../style/resolver-context.js";
import { parseVarRef } from "../../style/theme-tokens.js";
import { isMixed, MixedBadge, sharedValue, updateAll } from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

/** Picker → command value translator. When the user picked a theme swatch
 *  the picker emits `var(--accent)` literal; convert to a `StyleRef`
 *  ({$ref: "color.accent"}) so the StyleResolver cascade can override the
 *  token on intermediate ancestors. Custom (hex / rgb / arbitrary var)
 *  strings round-trip verbatim. */
function pickerValueToStored(v: string): string | { readonly $ref: string } {
  const tokenInfo = parseVarRef(v);
  return tokenInfo !== null ? styleRef(tokenInfo.tokenName) : v;
}

/** Shared section for the four domain frames (slide / canvas-design /
 *  block-doc / media). Edits a single attr — `attrs.background` — with
 *  the same multi-aware ColorPicker pattern. The attr is undefined when
 *  the frame is transparent; the "×" button clears back to undefined. */
export const FrameBackgroundSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  // Resolve each item's stored background — which may be a `StyleRef` after
  // WI-040 if the user picked a theme swatch — into a CSS string BEFORE
  // running through `sharedValue`. Two reasons:
  //   1. The picker's `value` prop expects a CSS string. Passing a StyleRef
  //      object made the trigger swatch render as `[object Object]` (no
  //      color) and broke `parseColor` inside the popover.
  //   2. `sharedValue`'s default `Object.is` equality reports two distinct
  //      StyleRef object references as "Mixed" even when they point at the
  //      same token. Resolving to a string first collapses identity to
  //      semantic equality.
  const doc = useDocumentForResolution();
  const background = sharedValue<string | undefined>(items, (it) => {
    const raw = (it.attrs as unknown as { background?: unknown }).background;
    if (doc === null) {
      return typeof raw === "string" ? raw : undefined;
    }
    const item = findItemDeep(doc, it.id);
    if (item === undefined) {
      return typeof raw === "string" ? raw : undefined;
    }
    return resolveStoredColor(doc, raw, item, undefined);
  });
  const bgHasValue = !isMixed(background) && background !== undefined;
  return (
    <Bar.Section label="Background">
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
