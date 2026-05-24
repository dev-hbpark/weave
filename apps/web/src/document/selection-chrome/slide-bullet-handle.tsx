// DR-018 extension PoC — slide-only "add bullet" handle.
//
// Demonstrates the registry's extension story: a domain (or plugin)
// contributes handles for ONE specific item kind by registering an
// `ItemSelectionViewModel`. The default frame view-model (resize +
// rotate) continues to render alongside; the registry composes both.
//
// What this gives you, that the legacy `SelectionLayer` couldn't:
//   • A handle that ONLY appears when a slide is selected (not for
//     canvas-design / block-doc / media).
//   • A handle that fires a domain command (`weave.item.update` to
//     append a bullet) instead of resize / rotate math.
//   • A visually distinct handle (uses a `+` glyph in an accent
//     pill, not the standard square corner).
//
// Future extensions follow the same shape: register your view-model
// once at mount; SelectionLayer picks it up wherever the matching kind
// is selected.

import type {
  Editor,
  ItemSelectionViewModel,
} from "@agocraft/editor";

export interface SlideBulletHandleDeps {
  readonly editor: Editor;
}

export function createSlideBulletHandleViewModel(
  deps: SlideBulletHandleDeps,
): ItemSelectionViewModel {
  return {
    itemKind: "slide",
    /** Boost above the default (priority 0) so this view-model's
     *  handles render above the resize/rotate set if they ever
     *  overlap by id. We don't overlap in practice — different
     *  ids — but stating priority makes the contract explicit. */
    priority: 10,
    handles(info) {
      return [
        {
          id: "slide.add-bullet",
          // Sit a hair beyond the bottom-right corner so it doesn't
          // collide with the SE resize handle.
          anchor: { type: "offset-from", from: "se", outwardPx: 22 },
          order: 100,
          render: () => (
            <button
              type="button"
              aria-label="Add bullet"
              data-handle-kind="custom"
              data-handle-id="slide.add-bullet"
              onPointerDown={(e) => {
                // Stop the press from bubbling to the frame body /
                // GestureRouter. The router's capture-phase listener
                // already ran (and declined — none of its bindings
                // claim a `data-handle-kind="custom"` target); React
                // bubble would otherwise reach the frame's onClick
                // and toggle selection.
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                deps.editor.exec("weave.item.update", {
                  itemId: info.itemId,
                  patch: (item: { attrs: { bullets?: ReadonlyArray<string> } }) => ({
                    ...item,
                    attrs: {
                      ...item.attrs,
                      bullets: [...(item.attrs.bullets ?? []), ""],
                    },
                  }),
                });
              }}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "white",
                border: "1.5px solid white",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.18)",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              +
            </button>
          ),
        },
      ];
    },
  };
}
