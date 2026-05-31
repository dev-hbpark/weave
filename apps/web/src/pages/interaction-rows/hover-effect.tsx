// Phase 13d — hover-effect row.
import type { ReactElement } from "react";
import type { HoverEffectBehavior } from "../../document";
import type { InteractionRowProps } from "./types.js";

export function HoverEffectRow({
  behavior,
  itemId,
  unitId,
  onCommitBehavior,
}: InteractionRowProps<HoverEffectBehavior>): ReactElement {
  return (
    <li
      className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
      data-testid="properties-interaction-hover-effect"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
          hover · {behavior.effect}
        </span>
        <input
          type="text"
          value={behavior.label ?? ""}
          placeholder="Label"
          className="flex-1 ml-2 px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
          data-testid="hover-effect-label"
          onChange={(e) =>
            onCommitBehavior(itemId, unitId, (b) => {
              if (b.kind !== "hover-effect") return b;
              return { ...b, label: e.target.value };
            })
          }
        />
      </div>
      <select
        className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
        value={behavior.effect}
        data-testid="hover-effect-mode"
        onChange={(e) =>
          onCommitBehavior(itemId, unitId, (b) => {
            if (b.kind !== "hover-effect") return b;
            const v = e.target.value;
            if (v !== "highlight" && v !== "dim-others" && v !== "reveal") return b;
            return { ...b, effect: v };
          })
        }
      >
        <option value="highlight">Highlight</option>
        <option value="dim-others">Dim others</option>
        <option value="reveal">Reveal target…</option>
      </select>
    </li>
  );
}
