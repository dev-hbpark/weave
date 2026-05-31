// Phase 13d — button-trigger row.
import type { ReactElement } from "react";
import type { ButtonTriggerBehavior } from "../../document";
import type { InteractionRowProps } from "./types.js";

export function ButtonTriggerRow({
  behavior,
  itemId,
  unitId,
  onCommitBehavior,
}: InteractionRowProps<ButtonTriggerBehavior>): ReactElement {
  return (
    <li
      className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
      data-testid="properties-interaction-button-trigger"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
          button → {behavior.action.type}
        </span>
        <input
          type="text"
          value={behavior.label ?? ""}
          placeholder="Label"
          className="flex-1 ml-2 px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
          data-testid="button-trigger-label"
          onChange={(e) =>
            onCommitBehavior(itemId, unitId, (b) => {
              if (b.kind !== "button-trigger") return b;
              return { ...b, label: e.target.value };
            })
          }
        />
      </div>
      <select
        className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
        value={behavior.action.type}
        data-testid="button-trigger-action"
        onChange={(e) =>
          onCommitBehavior(itemId, unitId, (b) => {
            if (b.kind !== "button-trigger") return b;
            const v = e.target.value;
            const action =
              v === "next-camera"
                ? ({ type: "next-camera" } as const)
                : v === "external"
                  ? ({ type: "external", href: "https://" } as const)
                  : v === "jump-camera"
                    ? ({ type: "jump-camera", targetId: "" } as const)
                    : ({ type: "reveal", targetId: "" } as const);
            return { ...b, action };
          })
        }
      >
        <option value="next-camera">Next slide</option>
        <option value="jump-camera">Jump to slide…</option>
        <option value="reveal">Reveal element…</option>
        <option value="external">Open URL…</option>
      </select>
    </li>
  );
}
