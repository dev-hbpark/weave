// WI-090 Phase 2 (DR-052) — the "link unit" authoring control.
//
// Cross-kind surface: shown for ANY single selected item (text / image / shape /
// line / qr / chart / frame). Lets the user attach a link that fires in Present
// mode (runtime: `ItemInteractionLayer` + `buttonTriggerAdapter`, Phase 1):
//   • None   — no link (removes the button-trigger behavior).
//   • URL    — opens a URL in a new tab        → action `external`.
//   • Slide  — jumps to a slide in this design → action `jump-camera`,
//              targetId `present-${frameId}` (DR-052 §1, id-based so it survives
//              slide reorder).
//
// The link is stored as a single `button-trigger` Unit on the item; all three
// mutations route through History via `editor.exec` (CLAUDE.md § Document
// mutation rule), so Cmd+Z reverts them. This is NOT a kind section — like the
// flex/grid child controls it is rendered by the ContextualToolbar alongside
// the kind section because a link applies to every kind equally.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { ContextualToolbar as Bar, Select } from "@weave/design-system";
import { type JSX, useState } from "react";
import { findItemDeep } from "../../agocraft-mirror.js";
import { collectPresentationIds } from "../../presentation-order.js";
import type { ButtonTriggerBehavior } from "../../types.js";
import type { ItemSnapshot } from "../multi-edit.js";
import { type LinkMode, linkModeOf, planSetAction, planSetMode } from "./link-mutations.js";

const MODE_OPTIONS: ReadonlyArray<{ value: LinkMode; label: string }> = [
  { value: "none", label: "없음" },
  { value: "url", label: "URL 열기" },
  { value: "slide", label: "슬라이드 이동" },
];

interface LinkSectionProps {
  readonly editor: Editor;
  readonly items: ReadonlyArray<ItemSnapshot>;
  /** Live document — to read the item's current behavior Unit + the slide list. */
  readonly document: AgocraftDocument;
}

/** The item's link Unit (a `button-trigger`), if any. Returns the unit id (what
 *  `weave.behavior.update` / `removeBehavior` key on) plus its behavior. */
function readLinkUnit(
  doc: AgocraftDocument,
  itemId: string,
): { unitId: string; behavior: ButtonTriggerBehavior } | undefined {
  const found = findItemDeep(doc, itemId);
  if (found === undefined) return undefined;
  const units =
    (
      found as {
        units?: ReadonlyArray<{ id: unknown; kind: string; attrs: { behavior?: unknown } }>;
      }
    ).units ?? [];
  const unit = units.find((u) => u.kind === "button-trigger");
  if (unit === undefined) return undefined;
  return { unitId: String(unit.id), behavior: unit.attrs.behavior as ButtonTriggerBehavior };
}

/** Presentable frames as jump targets: camera id `present-${frameId}` + a label. */
function slideTargets(doc: AgocraftDocument): ReadonlyArray<{ value: string; label: string }> {
  return collectPresentationIds(doc.root).map((frameId, i) => {
    const frame = findItemDeep(doc, frameId);
    const label = ((frame?.attrs as { label?: string } | undefined)?.label ?? "").trim();
    return { value: `present-${frameId}`, label: label.length > 0 ? label : `슬라이드 ${i + 1}` };
  });
}

export function LinkSection({
  editor,
  items,
  document: doc,
}: LinkSectionProps): JSX.Element | null {
  // A link is a per-item concern (one target); keep authoring single-select.
  const [urlDraft, setUrlDraft] = useState<string | null>(null);

  const item = items.length === 1 ? items[0] : undefined;
  if (item === undefined) return null;
  const link = readLinkUnit(doc, item.id);
  const action = link?.behavior.action;
  const mode = linkModeOf(action);

  const slides = slideTargets(doc);
  const linkId = `link-${item.id}`;

  /** Replace the link Unit's action (update existing, else create the Unit). */
  const setAction = (next: ButtonTriggerBehavior["action"]): void => {
    const call = planSetAction({ itemId: item.id, linkId, unitId: link?.unitId, action: next });
    editor.exec(call.cmd, call.input);
  };

  const onModeChange = (next: LinkMode): void => {
    setUrlDraft(null);
    const call = planSetMode({
      itemId: item.id,
      linkId,
      unitId: link?.unitId,
      currentAction: action,
      nextMode: next,
      firstSlideTarget: slides[0]?.value,
    });
    if (call !== null) editor.exec(call.cmd, call.input);
  };

  const currentHref = action?.type === "external" ? action.href : "";
  const currentTarget = action?.type === "jump-camera" ? action.targetId : "";
  const urlValue = urlDraft ?? currentHref;

  return (
    <div
      role="group"
      aria-label="Link"
      data-testid="link-controls"
      className="inline-flex items-end gap-2 ml-1 pl-2 border-l border-l-[color:var(--surface-overlay-border)]"
    >
      <Bar.Field label="링크">
        <Select<LinkMode>
          value={mode}
          onValueChange={onModeChange}
          options={MODE_OPTIONS}
          aria-label="Link type"
          triggerClassName="min-w-[104px]"
          data-testid="link-mode-select"
        />
      </Bar.Field>

      {mode === "url" ? (
        <Bar.Field label="주소">
          <input
            type="url"
            value={urlValue}
            placeholder="https://..."
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => {
              if (urlDraft === null) return;
              setAction({ type: "external", href: urlDraft.trim() });
              setUrlDraft(null);
            }}
            className="w-[200px] rounded border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay-2)] px-2 py-1 text-[12px] text-[color:var(--text-overlay)]"
            data-testid="link-url-input"
            aria-label="Link URL"
          />
        </Bar.Field>
      ) : null}

      {mode === "slide" ? (
        <Bar.Field label="슬라이드">
          {slides.length === 0 ? (
            <span className="text-[11px] text-[color:var(--text-muted)] italic">슬라이드 없음</span>
          ) : (
            <Select<string>
              value={currentTarget}
              onValueChange={(v) => setAction({ type: "jump-camera", targetId: v })}
              options={slides}
              aria-label="Target slide"
              triggerClassName="min-w-[120px]"
              data-testid="link-slide-select"
            />
          )}
        </Bar.Field>
      ) : null}
    </div>
  );
}
