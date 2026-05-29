// Decoration shadow control for the ContextualToolbar (DR-028).
//
// Shadow is a UNIT (decoration.shadow), not an attr — this control edits it via
// `weave.item.setDecoration` (agocraft kit command), reading the current unit
// from the live document (ItemSnapshot carries no units). Shared by every
// kind-section so any item can get a shadow. A toggle adds/clears the unit;
// color + blur + offset sliders shape it. Slider drags use a local draft so the
// thumb tracks live, committing one transaction per drag.

import { findUnitInItem, SHADOW_UNIT_KIND, type ShadowSpec } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { ColorPicker, NumberSlider, Switch } from "@weave/design-system";
import { type JSX, useEffect, useState } from "react";
import { findItemDeep } from "../../agocraft-mirror.js";
import { useDocumentForResolution } from "../../style/resolver-context.js";

const DEFAULT_SHADOW: ShadowSpec = { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(0,0,0,0.25)" };

export function ShadowControls({
  editor,
  ids,
}: {
  readonly editor: Editor;
  readonly ids: ReadonlyArray<string>;
}): JSX.Element {
  const doc = useDocumentForResolution();

  // Representative current shadow (first item that has the unit) + whether any does.
  let current: ShadowSpec | undefined;
  if (doc !== null) {
    for (const id of ids) {
      const item = findItemDeep(doc, id);
      const s = item
        ? (findUnitInItem(item, SHADOW_UNIT_KIND)?.attrs as ShadowSpec | undefined)
        : undefined;
      if (s !== undefined) {
        current = s;
        break;
      }
    }
  }
  const on = current !== undefined;
  const spec = current ?? DEFAULT_SHADOW;

  // Live draft so slider thumbs track during a drag; re-synced when the committed
  // value (or selection) changes.
  const [draft, setDraft] = useState<ShadowSpec>(spec);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync the draft only
  // when the COMMITTED spec values change — `spec` itself is a fresh object each
  // render (depending on it would loop).
  useEffect(() => {
    setDraft(spec);
  }, [spec.x, spec.y, spec.blur, spec.spread, spec.color]);

  const writeAll = (next: ShadowSpec | null): void => {
    for (const id of ids) {
      editor.exec("weave.item.setDecoration", {
        itemId: id,
        kind: SHADOW_UNIT_KIND,
        attrs: next,
      });
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-default)]">
        <span>그림자</span>
        <Switch
          checked={on}
          onCheckedChange={(v) => writeAll(v ? DEFAULT_SHADOW : null)}
          aria-label="그림자"
          data-testid="shadow-toggle"
        />
      </div>
      {on ? (
        <div className="grid gap-1.5 pl-1">
          <ColorPicker
            aria-label="그림자 색"
            value={draft.color}
            onValueChange={(v) => setDraft((d) => ({ ...d, color: v }))}
            onValueCommit={(v) => writeAll({ ...draft, color: v })}
          />
          <NumberSlider
            aria-label="흐림"
            value={draft.blur}
            min={0}
            max={100}
            step={1}
            suffix="px"
            onValueChange={(v) => setDraft((d) => ({ ...d, blur: v }))}
            onValueCommit={(v) => writeAll({ ...draft, blur: v })}
          />
          <NumberSlider
            aria-label="가로 오프셋"
            value={draft.x}
            min={-100}
            max={100}
            step={1}
            suffix="px"
            onValueChange={(v) => setDraft((d) => ({ ...d, x: v }))}
            onValueCommit={(v) => writeAll({ ...draft, x: v })}
          />
          <NumberSlider
            aria-label="세로 오프셋"
            value={draft.y}
            min={-100}
            max={100}
            step={1}
            suffix="px"
            onValueChange={(v) => setDraft((d) => ({ ...d, y: v }))}
            onValueCommit={(v) => writeAll({ ...draft, y: v })}
          />
        </div>
      ) : null}
    </div>
  );
}
