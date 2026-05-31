// Phase 13d — entrance-animation row.
import type { ReactElement } from "react";
import type { EntranceAnimationBehavior } from "../../document";
import type { InteractionRowProps } from "./types.js";

export function EntranceAnimationRow({
  behavior,
  itemId,
  unitId,
  onCommitBehavior,
}: InteractionRowProps<EntranceAnimationBehavior>): ReactElement {
  return (
    <li
      className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
      data-testid="properties-interaction-entrance-animation"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
          animation · {behavior.mode}
        </span>
        <input
          type="text"
          value={behavior.label ?? ""}
          placeholder="Label"
          className="flex-1 ml-2 px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
          data-testid="entrance-animation-label"
          onChange={(e) =>
            onCommitBehavior(itemId, unitId, (b) => {
              if (b.kind !== "entrance-animation") return b;
              return { ...b, label: e.target.value };
            })
          }
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <label className="grid gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            Mode
          </span>
          <select
            className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
            value={behavior.mode}
            data-testid="entrance-animation-mode"
            onChange={(e) =>
              onCommitBehavior(itemId, unitId, (b) => {
                if (b.kind !== "entrance-animation") return b;
                const v = e.target.value;
                if (v !== "fade" && v !== "slide-up" && v !== "slide-down" && v !== "zoom-in")
                  return b;
                return { ...b, mode: v };
              })
            }
          >
            <option value="fade">Fade</option>
            <option value="slide-up">Slide up</option>
            <option value="slide-down">Slide down</option>
            <option value="zoom-in">Zoom in</option>
          </select>
        </label>
        <label className="grid gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            Step
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={behavior.step}
            className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
            data-testid="entrance-animation-step"
            onChange={(e) => {
              const v = Math.max(0, Math.floor(Number(e.currentTarget.value)));
              if (!Number.isFinite(v)) return;
              onCommitBehavior(itemId, unitId, (b) => {
                if (b.kind !== "entrance-animation") return b;
                return { ...b, step: v };
              });
            }}
          />
        </label>
        <label className="grid gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            Duration
          </span>
          <input
            type="number"
            min={50}
            step={50}
            value={behavior.durationMs}
            className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
            data-testid="entrance-animation-duration"
            onChange={(e) => {
              const v = Math.max(50, Math.floor(Number(e.currentTarget.value)));
              if (!Number.isFinite(v)) return;
              onCommitBehavior(itemId, unitId, (b) => {
                if (b.kind !== "entrance-animation") return b;
                return { ...b, durationMs: v };
              });
            }}
          />
        </label>
      </div>
    </li>
  );
}
