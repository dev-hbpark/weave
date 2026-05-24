import { Card, EditableText } from "@weave/design-system";
import { useCallback } from "react";
import type { AgoItem, SlideAttrs } from "../types.js";

interface SlideBlockProps {
  readonly item: AgoItem<"slide">;
  /** When provided, the slide title + bullets become inline-editable. */
  readonly onUpdate?: (patch: Partial<SlideAttrs>) => void;
}

export function SlideBlock({ item, onUpdate }: SlideBlockProps) {
  const editable = onUpdate !== undefined;

  const commitTitle = useCallback(
    (next: string) => {
      onUpdate?.({ title: next });
    },
    [onUpdate],
  );

  const commitBullet = useCallback(
    (index: number, next: string) => {
      if (onUpdate === undefined) return;
      const bullets = [...item.attrs.bullets];
      bullets[index] = next;
      onUpdate({ bullets });
    },
    [onUpdate, item.attrs.bullets],
  );

  const insertBulletAfter = useCallback(
    (index: number) => {
      if (onUpdate === undefined) return;
      const bullets = [...item.attrs.bullets];
      bullets.splice(index + 1, 0, "");
      onUpdate({ bullets });
    },
    [onUpdate, item.attrs.bullets],
  );

  const removeBullet = useCallback(
    (index: number) => {
      if (onUpdate === undefined) return;
      if (item.attrs.bullets.length <= 1) return; // keep at least one
      const bullets = item.attrs.bullets.filter((_, i) => i !== index);
      onUpdate({ bullets });
    },
    [onUpdate, item.attrs.bullets],
  );

  // Hover-tooltip metadata: each editable inner item carries its own
  // `data-hover-context` so the cursor popup describes the inner element
  // (the title, a single bullet) instead of "the slide". Read-only renders
  // skip the attributes — there's nothing for the user to do.
  const titleHover = editable
    ? {
        "data-hover-context": "슬라이드 제목",
        "data-hover-actions": JSON.stringify([
          { action: "편집 — 클릭" },
          { action: "확정 — Enter" },
        ]),
      }
    : {};
  const bulletHover = (idx: number) =>
    editable
      ? {
          "data-hover-context": `글머리 ${idx + 1}`,
          "data-hover-actions": JSON.stringify([
            { action: "편집 — 클릭" },
            { action: "추가 — Enter" },
            { action: "삭제 — Backspace" },
          ]),
        }
      : {};

  return (
    <Card
      tone="transparent"
      className="p-0 md:p-0 h-full"
      {...(item.attrs.background !== undefined
        ? { style: { background: item.attrs.background } }
        : {})}
    >
      <div className="h-full p-6 md:p-8 flex flex-col justify-between">
        {editable ? (
          <EditableText
            as="div"
            clickToEdit="double"
            value={item.attrs.title}
            ariaLabel="Slide title"
            placeholder="Title…"
            className="text-[28px] md:text-[32px] font-semibold tracking-tight text-[color:var(--text-strong)]"
            onCommit={commitTitle}
            {...titleHover}
          />
        ) : (
          <h3 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-[color:var(--text-strong)]">
            {item.attrs.title}
          </h3>
        )}
        <ul className="space-y-2 text-[14px] text-[color:var(--text-default)]">
          {item.attrs.bullets.map((b, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: bullets are positional; we splice in place
            <li key={`b-${idx}`} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--domain-slide-accent)] shrink-0"
              />
              {editable ? (
                <EditableText
                  as="span"
                  clickToEdit="double"
                  value={b}
                  ariaLabel={`Bullet ${idx + 1}`}
                  placeholder="Bullet…"
                  className="flex-1"
                  onCommit={(next) => commitBullet(idx, next)}
                  onEnterCommit={() => insertBulletAfter(idx)}
                  onBackspaceEmpty={() => removeBullet(idx)}
                  {...bulletHover(idx)}
                />
              ) : (
                <span>{b}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
