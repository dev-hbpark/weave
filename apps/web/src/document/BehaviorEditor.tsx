import { IconCamera, IconChevronRight, IconPlay, IconSparkle } from "@weave/design-system";
import { useState } from "react";
import { getBehaviors } from "./agocraft-mirror.js";
import type {
  AgoItem,
  CameraTargetBehavior,
  HotspotBehavior,
  InteractionBehavior,
  RevealOnStepBehavior,
} from "./types.js";

// PoC behavior editor — number inputs + a single slider. Lives in apps/web,
// not in design-system, because it is project-specific glue (no other surface
// edits agocraft Items right now). When the second consumer arrives this
// pattern should graduate to a design-system primitive via design-system-triage.

type UpdateFn = (
  itemId: string,
  behaviorId: string,
  patch: (b: InteractionBehavior) => InteractionBehavior,
) => void;

interface BehaviorEditorProps {
  readonly item: AgoItem;
  readonly onUpdate: UpdateFn;
}

const labelClass =
  "text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-muted)] block mb-1";
const inputClass =
  "w-full h-9 px-2.5 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[13px] text-[color:var(--text-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

export function BehaviorEditor({ item, onUpdate }: BehaviorEditorProps) {
  const [open, setOpen] = useState(false);
  const behaviors = getBehaviors(item);
  if (behaviors.length === 0) return null;
  const itemId = String(item.id);

  return (
    <div className="mt-4 border-t border-[color:var(--surface-1-border)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] transition-colors"
        aria-expanded={open}
      >
        <IconChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        Behaviors ({behaviors.length})
      </button>
      {open ? (
        <div className="mt-3 grid gap-3">
          {behaviors.map((behavior) => (
            <BehaviorRow
              key={behavior.id}
              behavior={behavior}
              onChange={(patch) => onUpdate(itemId, behavior.id, patch)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BehaviorRow({
  behavior,
  onChange,
}: {
  behavior: InteractionBehavior;
  onChange: (patch: (b: InteractionBehavior) => InteractionBehavior) => void;
}) {
  switch (behavior.kind) {
    case "camera-target":
      return <CameraTargetRow behavior={behavior} onChange={onChange} />;
    case "hotspot":
      return <HotspotRow behavior={behavior} onChange={onChange} />;
    case "reveal-on-step":
      return <RevealOnStepRow behavior={behavior} onChange={onChange} />;
  }
}

function CameraTargetRow({
  behavior,
  onChange,
}: {
  behavior: CameraTargetBehavior;
  onChange: (patch: (b: InteractionBehavior) => InteractionBehavior) => void;
}) {
  const patch = (next: Partial<CameraTargetBehavior>) =>
    onChange((b) => ({ ...(b as CameraTargetBehavior), ...next }) as InteractionBehavior);
  return (
    <fieldset className="rounded-[var(--radius-md)] bg-[color:var(--surface-1)] p-3">
      <legend className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--accent-strong)] px-1">
        <IconCamera size={11} />
        camera · order {behavior.order + 1}
      </legend>
      <div className="grid grid-cols-3 gap-2 mt-1">
        <label className="block">
          <span className={labelClass}>x</span>
          <input
            type="number"
            className={inputClass}
            value={behavior.position.x}
            onChange={(e) =>
              patch({ position: { ...behavior.position, x: Number(e.target.value) || 0 } })
            }
            aria-label={`camera ${behavior.order + 1} x`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>y</span>
          <input
            type="number"
            className={inputClass}
            value={behavior.position.y}
            onChange={(e) =>
              patch({ position: { ...behavior.position, y: Number(e.target.value) || 0 } })
            }
            aria-label={`camera ${behavior.order + 1} y`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>scale</span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.05}
            className="w-full h-9"
            value={behavior.scale}
            onChange={(e) => patch({ scale: Number(e.target.value) || 1 })}
            aria-label={`camera ${behavior.order + 1} scale`}
          />
          <span className="text-[11px] text-[color:var(--text-muted)] tabular-nums">
            {behavior.scale.toFixed(2)}×
          </span>
        </label>
      </div>
    </fieldset>
  );
}

function HotspotRow({
  behavior,
  onChange,
}: {
  behavior: HotspotBehavior;
  onChange: (patch: (b: InteractionBehavior) => InteractionBehavior) => void;
}) {
  const patch = (next: Partial<HotspotBehavior>) =>
    onChange((b) => ({ ...(b as HotspotBehavior), ...next }) as InteractionBehavior);
  return (
    <fieldset className="rounded-[var(--radius-md)] bg-[color:var(--surface-1)] p-3">
      <legend className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--accent-strong)] px-1">
        <IconSparkle size={11} />
        hotspot · {behavior.label ?? "Hotspot"}
      </legend>
      <div className="grid grid-cols-4 gap-2 mt-1">
        <NumberCell
          label="x"
          aria={`hotspot ${behavior.id} x`}
          value={behavior.region.x}
          onChange={(v) => patch({ region: { ...behavior.region, x: clamp01(v) } })}
        />
        <NumberCell
          label="y"
          aria={`hotspot ${behavior.id} y`}
          value={behavior.region.y}
          onChange={(v) => patch({ region: { ...behavior.region, y: clamp01(v) } })}
        />
        <NumberCell
          label="w"
          aria={`hotspot ${behavior.id} w`}
          value={behavior.region.width}
          onChange={(v) => patch({ region: { ...behavior.region, width: clamp01(v) } })}
        />
        <NumberCell
          label="h"
          aria={`hotspot ${behavior.id} h`}
          value={behavior.region.height}
          onChange={(v) => patch({ region: { ...behavior.region, height: clamp01(v) } })}
        />
      </div>
    </fieldset>
  );
}

function RevealOnStepRow({
  behavior,
  onChange,
}: {
  behavior: RevealOnStepBehavior;
  onChange: (patch: (b: InteractionBehavior) => InteractionBehavior) => void;
}) {
  const patch = (next: Partial<RevealOnStepBehavior>) =>
    onChange((b) => ({ ...(b as RevealOnStepBehavior), ...next }) as InteractionBehavior);
  return (
    <fieldset className="rounded-[var(--radius-md)] bg-[color:var(--surface-1)] p-3">
      <legend className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--accent-strong)] px-1">
        <IconPlay size={11} />
        reveal-on-step
      </legend>
      <label className="block mt-1 max-w-[160px]">
        <span className={labelClass}>step (0-indexed)</span>
        <input
          type="number"
          min={0}
          step={1}
          className={inputClass}
          value={behavior.step}
          onChange={(e) => patch({ step: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          aria-label={`reveal step for ${behavior.id}`}
        />
      </label>
    </fieldset>
  );
}

function NumberCell({
  label,
  aria,
  value,
  onChange,
}: {
  label: string;
  aria: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        step={0.01}
        min={0}
        max={1}
        className={inputClass}
        value={Number(value.toFixed(2))}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        aria-label={aria}
      />
    </label>
  );
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
