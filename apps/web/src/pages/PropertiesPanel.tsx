// Phase 13a — Properties panel (right side, floating, fixed).
//
// Selected frame 의 (a) frame box (x/y/w/h/rotation, 0..1 ratio + 도) (b) 도메인
// attrs (title / heading / caption / summary) (c) interactions list (read).
// Drives v1 의 모든 interactive editing — camera-target 수동 (13b), hotspot
// region editor (13c), 새 trigger / animation (13d) 가 이 panel 안에 박제.
//
// Layout 결정 — spec §6.1 future zone "Right panel (Properties)" 의 첫 구현.
// floating fixed right (selected frame 있을 때만 visible). main canvas 의 너비
// 영향 작게 유지 + dismissible.

import type { Item as AgocraftItem, Unit as AgocraftUnit } from "@agocraft/core";
import {
  Card,
  CardEyebrow,
  FieldGroup,
  IconButton,
  IconCheck,
  IconClose,
  IconSparkle,
  TextField,
} from "@weave/design-system";
import { useMemo } from "react";
import {
  type CameraTargetBehavior,
  DOMAIN_REGISTRY,
  type DomainKind,
  type InteractionBehavior,
  type ItemFrame,
} from "../document";

export interface PropertiesPanelProps {
  readonly item: AgocraftItem;
  readonly onCommitFrame: (itemId: string, next: ItemFrame) => void;
  readonly onCommitAttrs: (itemId: string, patch: Record<string, unknown>) => void;
  readonly onCommitBehavior: (
    itemId: string,
    behaviorId: string,
    patch: (b: InteractionBehavior) => InteractionBehavior,
  ) => void;
  readonly onAddBehavior: (itemId: string, behavior: InteractionBehavior) => void;
  readonly onClose: () => void;
}

function newBehaviorId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

interface FrameRow {
  readonly label: string;
  readonly value: number;
  readonly step: number;
  readonly min?: number;
  readonly max?: number;
  readonly onChange: (next: number) => void;
}

const FRAME_MIN = 0;
const FRAME_MAX = 1;
const ROTATION_MIN = -360;
const ROTATION_MAX = 360;

export function PropertiesPanel({
  item,
  onCommitFrame,
  onCommitAttrs,
  onCommitBehavior,
  onAddBehavior,
  onClose,
}: PropertiesPanelProps) {
  const itemId = String(item.id);
  const kind = item.kind as DomainKind;
  const meta = DOMAIN_REGISTRY[kind];
  const attrs = item.attrs as { frame: ItemFrame } & Record<string, unknown>;
  const frame = attrs.frame;

  const frameRows: ReadonlyArray<FrameRow> = useMemo(() => {
    const commit = (patch: Partial<ItemFrame>) => onCommitFrame(itemId, { ...frame, ...patch });
    return [
      {
        label: "X",
        value: roundTo(frame.x, 3),
        step: 0.01,
        min: FRAME_MIN,
        max: FRAME_MAX,
        onChange: (v) => commit({ x: clamp(v, FRAME_MIN, FRAME_MAX) }),
      },
      {
        label: "Y",
        value: roundTo(frame.y, 3),
        step: 0.01,
        min: FRAME_MIN,
        max: FRAME_MAX,
        onChange: (v) => commit({ y: clamp(v, FRAME_MIN, FRAME_MAX) }),
      },
      {
        label: "W",
        value: roundTo(frame.width, 3),
        step: 0.01,
        min: 0.02,
        max: FRAME_MAX,
        onChange: (v) => commit({ width: clamp(v, 0.02, FRAME_MAX) }),
      },
      {
        label: "H",
        value: roundTo(frame.height, 3),
        step: 0.01,
        min: 0.02,
        max: FRAME_MAX,
        onChange: (v) => commit({ height: clamp(v, 0.02, FRAME_MAX) }),
      },
      {
        label: "Rotation (deg)",
        value: roundTo((frame.rotation * 180) / Math.PI, 1),
        step: 1,
        min: ROTATION_MIN,
        max: ROTATION_MAX,
        onChange: (v) =>
          commit({ rotation: (clamp(v, ROTATION_MIN, ROTATION_MAX) * Math.PI) / 180 }),
      },
    ];
  }, [frame, itemId, onCommitFrame]);

  const attrRows = useMemo(() => attrsByKind(kind, attrs), [kind, attrs]);

  return (
    <aside
      className="fixed right-4 top-32 z-30 w-[300px] max-h-[calc(100vh-180px)] overflow-y-auto"
      aria-label="Frame properties"
      data-testid="properties-panel"
    >
      <Card tone="raised" className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <CardEyebrow>{meta.label} frame</CardEyebrow>
            <p className="text-[12px] text-[color:var(--text-muted)] mt-0.5">{meta.tagline}</p>
          </div>
          <IconButton
            aria-label="Close properties"
            size="sm"
            variant="ghost"
            onClick={onClose}
            data-testid="properties-close"
          >
            <IconClose size={14} />
          </IconButton>
        </div>

        <FieldGroup legend="Position & size" description="0..1 ratio of parent">
          <div className="grid grid-cols-2 gap-2">
            {frameRows.map((row) => (
              <NumberField key={row.label} row={row} />
            ))}
          </div>
        </FieldGroup>

        {attrRows.length > 0 ? (
          <div className="mt-4">
            <FieldGroup legend="Content">
              <div className="grid gap-2">
                {attrRows.map((row) => (
                  <TextField
                    key={row.key}
                    label={row.label}
                    value={String(row.value)}
                    onChange={(e) => onCommitAttrs(itemId, { [row.key]: e.currentTarget.value })}
                    data-testid={`properties-attr-${row.key}`}
                  />
                ))}
              </div>
            </FieldGroup>
          </div>
        ) : null}

        <InteractionsList
          units={item.units}
          itemId={itemId}
          onCommitBehavior={onCommitBehavior}
          onAddBehavior={onAddBehavior}
        />
      </Card>
    </aside>
  );
}

function NumberField({ row }: { row: FrameRow }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {row.label}
      </span>
      <input
        type="number"
        value={row.value}
        step={row.step}
        min={row.min}
        max={row.max}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v)) row.onChange(v);
        }}
        className="px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] text-[13px] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
        data-testid={`properties-frame-${row.label.toLowerCase().replace(/\s.+/, "")}`}
      />
    </label>
  );
}

interface AttrRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function attrsByKind(kind: DomainKind, attrs: Record<string, unknown>): ReadonlyArray<AttrRow> {
  // WI-032 Phase 3 — the legacy 4 domains carried single-string attrs
  // (title / summary / heading / caption); the new `frame` paradigm
  // exposes those via primitive text children inside the frame, so
  // PropertiesPanel no longer needs per-kind attr rows here. Primitive
  // kinds have richer sections rendered elsewhere (text section,
  // shape section, …).
  void kind;
  void attrs;
  return [];
}

function InteractionsList({
  units,
  itemId,
  onCommitBehavior,
  onAddBehavior,
}: {
  units: ReadonlyArray<AgocraftUnit>;
  itemId: string;
  onCommitBehavior: PropertiesPanelProps["onCommitBehavior"];
  onAddBehavior: PropertiesPanelProps["onAddBehavior"];
}) {
  const addHotspot = () =>
    onAddBehavior(itemId, {
      kind: "hotspot",
      id: newBehaviorId("hot"),
      region: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
      trigger: "click",
      action: { type: "next-camera" },
      label: "Hotspot",
    });
  const addHover = () =>
    onAddBehavior(itemId, {
      kind: "hover-effect",
      id: newBehaviorId("hov"),
      effect: "highlight",
      label: "Hover effect",
    });
  const addButton = () =>
    onAddBehavior(itemId, {
      kind: "button-trigger",
      id: newBehaviorId("btn"),
      action: { type: "next-camera" },
      label: "Click to advance",
    });
  const addAnimation = () =>
    onAddBehavior(itemId, {
      kind: "entrance-animation",
      id: newBehaviorId("anim"),
      mode: "fade",
      step: 0,
      durationMs: 600,
      label: "Entrance",
    });

  return (
    <div className="mt-4">
      <FieldGroup legend="Interactions">
        {units.length === 0 ? (
          <p className="text-[12px] text-[color:var(--text-muted)] italic mb-2">
            None yet — add an interaction to drive present-mode behavior.
          </p>
        ) : (
          <ul className="grid gap-2 text-[12px]" data-testid="properties-interactions-list">
            {units.map((u) => (
              <InteractionRow
                key={String(u.id)}
                unit={u}
                itemId={itemId}
                onCommitBehavior={onCommitBehavior}
              />
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              { label: "+ Hotspot", onClick: addHotspot, testid: "properties-add-hotspot" },
              { label: "+ Hover", onClick: addHover, testid: "properties-add-hover" },
              { label: "+ Button", onClick: addButton, testid: "properties-add-button" },
              { label: "+ Animation", onClick: addAnimation, testid: "properties-add-animation" },
            ] as const
          ).map((b) => (
            <button
              key={b.label}
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--accent-soft)] border border-[color:var(--accent)]/30 text-[12px] text-[color:var(--accent-strong)] hover:bg-[color:var(--accent-soft)]/80 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
              onClick={b.onClick}
              data-testid={b.testid}
            >
              {b.label}
            </button>
          ))}
        </div>
      </FieldGroup>
    </div>
  );
}

function InteractionRow({
  unit,
  itemId,
  onCommitBehavior,
}: {
  unit: AgocraftUnit;
  itemId: string;
  onCommitBehavior: PropertiesPanelProps["onCommitBehavior"];
}) {
  const behavior = unit.attrs.behavior as InteractionBehavior | undefined;
  const unitId = String(unit.id);
  if (behavior === undefined) {
    return (
      <li className="px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)]">
        <span className="text-[color:var(--text-muted)]">— (no payload)</span>
      </li>
    );
  }

  // Phase 13b — camera-target gets manual position / scale + reset-to-auto.
  if (behavior.kind === "camera-target") {
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

  // Phase 13c — hotspot region + action + label visual editor (number-input
  // form). The drag-resize SelectionLayer overlay arrives in 13c-2.
  if (behavior.kind === "hotspot") {
    const hot = behavior;
    const region = hot.region;
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
            hotspot · {hot.trigger}
          </span>
          <input
            type="text"
            value={hot.label ?? ""}
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
          value={hot.action.type}
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

  // Phase 13d — hover-effect
  if (behavior.kind === "hover-effect") {
    const hov = behavior;
    return (
      <li
        className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
        data-testid="properties-interaction-hover-effect"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            hover · {hov.effect}
          </span>
          <input
            type="text"
            value={hov.label ?? ""}
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
          value={hov.effect}
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

  // Phase 13d — button-trigger
  if (behavior.kind === "button-trigger") {
    const btn = behavior;
    return (
      <li
        className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
        data-testid="properties-interaction-button-trigger"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            button → {btn.action.type}
          </span>
          <input
            type="text"
            value={btn.label ?? ""}
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
          value={btn.action.type}
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

  // Phase 13d — entrance-animation
  if (behavior.kind === "entrance-animation") {
    const anim = behavior;
    return (
      <li
        className="px-2 py-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] grid gap-2"
        data-testid="properties-interaction-entrance-animation"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            animation · {anim.mode}
          </span>
          <input
            type="text"
            value={anim.label ?? ""}
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
              value={anim.mode}
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
              value={anim.step}
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
              value={anim.durationMs}
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

  // reveal-on-step + future kinds — read-only label.
  return (
    <li
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)]"
      data-testid={`properties-interaction-${unit.kind}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
        {unit.kind}
      </span>
      <span className="text-[12px] text-[color:var(--text-default)] truncate">
        {describeInteraction(unit.kind, behavior)}
      </span>
    </li>
  );
}

function describeInteraction(
  kind: string,
  behavior?: {
    kind: string;
    label?: string;
    order?: number;
    step?: number;
    action?: { type?: string };
  },
): string {
  if (behavior === undefined) return "—";
  switch (kind) {
    case "camera-target":
      return `step ${(behavior.order ?? 0) + 1}${behavior.label ? ` · ${behavior.label}` : ""}`;
    case "hotspot": {
      const a = (behavior as { action?: { type?: string } }).action;
      return `${behavior.label ?? "Hotspot"} → ${a?.type ?? "—"}`;
    }
    case "reveal-on-step":
      return `reveal at step ${(behavior.step ?? 0) + 1}`;
    default:
      return behavior.label ?? "—";
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
