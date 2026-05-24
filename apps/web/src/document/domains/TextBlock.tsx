// WI-023 Phase 15 + Phase 18 — TextBlock renderer.
//
// Paints a TextAttrs item as a styled <div>. Inline-edit via EditableText
// when an `onUpdate` is wired (= edit mode). Read-only render in present
// mode (no editor handles attached).
//
// All typographic numbers are in DESIGN pixels, not screen pixels — the
// camera/Stage transform scales the whole layer including the text, so a
// 24-design-pixel text reads larger on screen as the user zooms in.
//
// Phase 18 — auto-height: a ResizeObserver watches the rendered text
// content; whenever its height diverges from the current frame.height
// (in ratio of the parent container), we dispatch a frame.height update.
// Combined with the SelectionViewModel removing n/s handles for text
// items, the user can only set the WIDTH manually (edge or corner) and
// the height always follows the wrapped content.

import { EditableText } from "@weave/design-system";
import { type CSSProperties, useEffect, useRef } from "react";
import type { AgoItem, ItemFrame, TextAttrs } from "../types.js";

interface TextBlockProps {
  readonly item: AgoItem<"text">;
  readonly onUpdate?: (patch: Partial<TextAttrs>) => void;
}

export function TextBlock({ item, onUpdate }: TextBlockProps) {
  const a = item.attrs;
  const editable = onUpdate !== undefined;

  // Auto-height plumbing. The OUTER container fills the frame box; the
  // INNER content div is what we measure. We must use the inner div (not
  // the outer) because the outer is sized to frame.height — measuring it
  // would always return the current height, not the natural content
  // height.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<ItemFrame>(a.frame);
  frameRef.current = a.frame;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const el = innerRef.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => {
      const measured = el.scrollHeight + 8;
      const frameEl = el.closest("[data-frame-id]");
      const parent = frameEl?.parentElement ?? null;
      if (parent === null) return;
      const parentH = parent.getBoundingClientRect().height;
      if (parentH <= 0) return;
      const newRatio = measured / parentH;
      const rounded = Math.round(newRatio * 10000) / 10000;
      // Compare against the LIVE doc height (`frameRef`) rather than the
      // last dispatched value. An earlier dispatch can be overwritten by
      // some other write (e.g. an explicit `weave.item.update` from the
      // host) and the observer would otherwise refuse to re-converge.
      if (Math.abs(rounded - frameRef.current.height) < 0.0005) return;
      onUpdateRef.current?.({
        frame: { ...frameRef.current, height: rounded },
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const containerStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    // overflow: visible so the content can spill briefly during the
    // frame-height catch-up tick; the user never sees this in practice
    // because the ResizeObserver pushes the new height within one frame.
    overflow: "visible",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems:
      a.textAlign === "center"
        ? "center"
        : a.textAlign === "right"
          ? "flex-end"
          : "stretch",
    padding: 4,
    ...(a.background !== undefined ? { background: a.background } : {}),
    opacity: a.opacity,
  };
  const textStyle: CSSProperties = {
    width: "100%",
    fontFamily: a.fontFamily,
    fontSize: `${a.fontSize}px`,
    fontWeight: a.fontWeight,
    fontStyle: a.fontStyle,
    color: a.color,
    textAlign: a.textAlign,
    lineHeight: a.lineHeight,
    letterSpacing: `${a.letterSpacing}px`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    // Don't allow the rendered content to be narrower than one character
    // visually — caps how aggressively width can collapse. The frame box's
    // width is set by frame.width; this just stops the inner text from
    // dropping below a 1ch ribbon.
    minWidth: "1ch",
  };

  return (
    <div style={containerStyle} data-testid="text-block">
      <div ref={innerRef} style={textStyle}>
        {editable ? (
          <EditableText
            as="div"
            multiline
            clickToEdit="double"
            value={a.text}
            ariaLabel="Text content"
            placeholder="텍스트 입력…"
            className="outline-none w-full"
            onCommit={(next) => onUpdate?.({ text: next })}
          />
        ) : (
          <>{a.text}</>
        )}
      </div>
    </div>
  );
}
