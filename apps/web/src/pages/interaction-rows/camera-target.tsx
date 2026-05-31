// Phase 13b — camera-target row: manual position / scale + reset-to-auto.
import { IconCheck, IconSparkle } from "@weave/design-system";
import type { ReactElement } from "react";
import type { CameraTargetBehavior } from "../../document";
import type { InteractionRowProps } from "./types.js";

export function CameraTargetRow({
  behavior,
  itemId,
  unitId,
  onCommitBehavior,
}: InteractionRowProps<CameraTargetBehavior>): ReactElement {
  return (
    <li
      className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
      data-testid="properties-interaction-camera-target"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
          camera-target · step {(behavior.order ?? 0) + 1}
        </span>
        <button
          type="button"
          className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--accent)] hover:underline bg-transparent border-0 p-0 cursor-pointer"
          data-testid="camera-target-toggle-manual"
          onClick={() =>
            onCommitBehavior(itemId, unitId, (b) => {
              if (b.kind !== "camera-target") return b;
              const cam = b as CameraTargetBehavior;
              return { ...cam, manual: cam.manual !== true };
            })
          }
        >
          <span className="inline-flex items-center gap-1">
            {behavior.manual === true ? <IconCheck size={11} /> : <IconSparkle size={11} />}
            {behavior.manual === true ? "manual" : "auto"}
          </span>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(["x", "y", "scale"] as const).map((field) => {
          const value =
            field === "scale"
              ? behavior.scale
              : (behavior.position as { x: number; y: number })[field];
          const step = field === "scale" ? 0.1 : 0.01;
          return (
            <label key={field} className="grid gap-0.5">
              <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
                {field}
              </span>
              <input
                type="number"
                step={step}
                value={Math.round(value * 1000) / 1000}
                className="px-2 py-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
                data-testid={`camera-target-${field}`}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (!Number.isFinite(v)) return;
                  onCommitBehavior(itemId, unitId, (b) => {
                    if (b.kind !== "camera-target") return b;
                    const cam = b as CameraTargetBehavior;
                    if (field === "scale") {
                      return { ...cam, scale: Math.max(0.05, v), manual: true };
                    }
                    return {
                      ...cam,
                      position: {
                        ...cam.position,
                        [field]: v,
                      } as CameraTargetBehavior["position"],
                      manual: true,
                    };
                  });
                }}
              />
            </label>
          );
        })}
      </div>
    </li>
  );
}
