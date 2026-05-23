import { useEditorOrNull } from "@agocraft/editor/react";
import { Card, CardEyebrow, EditableText } from "@weave/design-system";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { RubberBandLayer } from "../rubber-band/RubberBandLayer.js";
import type { AgoItem, BlockDocAttrs } from "../types.js";

interface DocBlockProps {
  readonly item: AgoItem<"block-doc">;
  readonly onUpdate?: (patch: Partial<BlockDocAttrs>) => void;
}

export function DocBlock({ item, onUpdate }: DocBlockProps) {
  const editable = onUpdate !== undefined;
  const editor = useEditorOrNull();
  // WI-017 Phase F-2 — track paragraphs-container size for ratio normalization.
  const paragraphsRef = useRef<HTMLDivElement | null>(null);
  const [paragraphsSize, setParagraphsSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  useLayoutEffect(() => {
    const el = paragraphsRef.current;
    if (el === null) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        setParagraphsSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commitHeading = useCallback((next: string) => onUpdate?.({ heading: next }), [onUpdate]);

  const commitParagraph = useCallback(
    (index: number, next: string) => {
      if (onUpdate === undefined) return;
      const paragraphs = [...item.attrs.paragraphs];
      paragraphs[index] = next;
      onUpdate({ paragraphs });
    },
    [onUpdate, item.attrs.paragraphs],
  );

  const insertParagraphAfter = useCallback(
    (index: number) => {
      if (onUpdate === undefined) return;
      const paragraphs = [...item.attrs.paragraphs];
      paragraphs.splice(index + 1, 0, "");
      onUpdate({ paragraphs });
    },
    [onUpdate, item.attrs.paragraphs],
  );

  const removeParagraph = useCallback(
    (index: number) => {
      if (onUpdate === undefined) return;
      if (item.attrs.paragraphs.length <= 1) return;
      const paragraphs = item.attrs.paragraphs.filter((_, i) => i !== index);
      onUpdate({ paragraphs });
    },
    [onUpdate, item.attrs.paragraphs],
  );

  return (
    <Card tone="default" className="border-l-4 border-l-[color:var(--domain-block-accent)]">
      <CardEyebrow>Doc · {new Date(item.meta.createdAt).toLocaleTimeString()}</CardEyebrow>
      {editable ? (
        <EditableText
          as="div"
          value={item.attrs.heading}
          ariaLabel="Doc heading"
          placeholder="Heading…"
          className="mt-3 text-[20px] font-semibold tracking-tight text-[color:var(--text-strong)]"
          onCommit={commitHeading}
        />
      ) : (
        <h3 className="mt-3 text-[20px] font-semibold tracking-tight text-[color:var(--text-strong)]">
          {item.attrs.heading}
        </h3>
      )}
      {/* WI-017 Phase F-2 — block-doc frame interior is a rubber-band host.
          Drag on empty space (areas not covered by paragraphs) opens the
          InsertableCapability popover for containerKind="block-doc"
          (paragraph variant per aspect bucket: wide=heading, tall=list,
          square=body). Falls back to a plain div in read-only / no-editor
          contexts. Note: paragraph rect is conceptual — block-doc's flat
          schema stores paragraphs as strings, so the commit only appends a
          new placeholder string regardless of rect position. */}
      {editable && editor !== null ? (
        <RubberBandLayer
          ref={paragraphsRef}
          containerKind="block-doc"
          containerId={String(item.id)}
          containerSize={paragraphsSize}
          editor={editor}
          className="mt-3 space-y-3 min-h-[80px]"
        >
          <DocParagraphList
            paragraphs={item.attrs.paragraphs}
            editable={editable}
            commitParagraph={commitParagraph}
            insertParagraphAfter={insertParagraphAfter}
            removeParagraph={removeParagraph}
          />
        </RubberBandLayer>
      ) : (
        <div ref={paragraphsRef} className="mt-3 space-y-3 min-h-[80px]">
          <DocParagraphList
            paragraphs={item.attrs.paragraphs}
            editable={editable}
            commitParagraph={commitParagraph}
            insertParagraphAfter={insertParagraphAfter}
            removeParagraph={removeParagraph}
          />
        </div>
      )}
    </Card>
  );
}

interface DocParagraphListProps {
  readonly paragraphs: ReadonlyArray<string>;
  readonly editable: boolean;
  readonly commitParagraph: (index: number, next: string) => void;
  readonly insertParagraphAfter: (index: number) => void;
  readonly removeParagraph: (index: number) => void;
}

/** Extracted paragraph list so the same JSX renders inside both the
 *  RubberBandLayer host and the read-only fallback div. */
function DocParagraphList({
  paragraphs,
  editable,
  commitParagraph,
  insertParagraphAfter,
  removeParagraph,
}: DocParagraphListProps) {
  return (
    <>
      {paragraphs.map((p, idx) =>
        editable ? (
          <EditableText
            // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are positional; we splice in place
            key={`p-${idx}`}
            as="div"
            value={p}
            ariaLabel={`Paragraph ${idx + 1}`}
            placeholder="Paragraph…"
            className="text-[14px] leading-relaxed text-[color:var(--text-default)]"
            onCommit={(next) => commitParagraph(idx, next)}
            onEnterCommit={() => insertParagraphAfter(idx)}
            onBackspaceEmpty={() => removeParagraph(idx)}
          />
        ) : (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: same rationale
            key={`p-${idx}`}
            className="text-[14px] leading-relaxed text-[color:var(--text-default)]"
          >
            {p}
          </p>
        ),
      )}
    </>
  );
}
