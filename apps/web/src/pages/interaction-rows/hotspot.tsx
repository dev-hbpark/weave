// Phase 13c — hotspot row: region + action + label visual editor.
import type { ReactElement } from "react";
import type { HotspotBehavior } from "../../document";
import type { InteractionRowProps } from "./types.js";

export function HotspotRow({
  behavior,
  itemId,
  unitId,
  onCommitBehavior,
}: InteractionRowProps<HotspotBehavior>): ReactElement {
  const region = behavior.region;
  const setRegion = (patch: Partial<typeof region>) =>
    onCommitBehavior(itemId, unitId, (b) => {
      if (b.kind !== "hotspot") return b;
      return { ...b, region: { ...b.region, ...patch } };
    });
  const setAction = (typ: string) =>
    onCommitBehavior(itemId, unitId, (b) => {
      if (b.kind !== "hotspot") return b;
      const action =
        typ === "next-camera"
          ? ({ type: "next-camera" } as const)
          : typ === "external"
            ? ({ type: "external", href: "https://" } as const)
            : typ === "jump-camera"
              ? ({ type: "jump-camera", targetId: "" } as const)
              : ({ type: "reveal", targetId: "" } as const);
      return { ...b, action };
    });
  return (
    <li
      className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
      data-testid="properties-interaction-hotspot"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
          hotspot · {behavior.trigger}
        </span>
        <input
          type="text"
          value={behavior.label ?? ""}
          placeholder="Label"
          className="flex-1 ml-2 px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
          data-testid="hotspot-label"
          onChange={(e) =>
            onCommitBehavior(itemId, unitId, (b) => {
              if (b.kind !== "hotspot") return b;
              return { ...b, label: e.target.value };
            })
          }
        />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {(["x", "y", "width", "height"] as const).map((field) => (
          <label key={field} className="grid gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
              {field === "width" ? "W" : field === "height" ? "H" : field.toUpperCase()}
            </span>
            <input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={Math.round(region[field] * 1000) / 1000}
              className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
              data-testid={`hotspot-region-${field}`}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                if (!Number.isFinite(v)) return;
                setRegion({ [field]: Math.max(0, Math.min(1, v)) });
              }}
            />
          </label>
        ))}
      </div>
      <select
        className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px]"
        value={behavior.action.type}
        onChange={(e) => setAction(e.currentTarget.value)}
        data-testid="hotspot-action-type"
      >
        <option value="next-camera">Next slide</option>
        <option value="jump-camera">Jump to slide…</option>
        <option value="reveal">Reveal element…</option>
        <option value="external">Open URL…</option>
      </select>
    </li>
  );
}
