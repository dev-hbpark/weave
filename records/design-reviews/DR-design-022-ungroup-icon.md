# DR-design-022 — IconUngroup ("delete frame, keep children") glyph

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-022 |
| Date | 2026-05-29 |
| Owner | hbpark |
| Component | `@weave/design-system` → `IconUngroup` (1 new static glyph in `Icon.tsx`) |
| Work item | [WI-050](../work-items/WI-050-dissolve-frame-keep-children.md) — delete frame but keep children |
| Triage Decision | **Step 3 — Grew × 1** (one new icon primitive) |

## Triage Walk

| Step | Considered? | Result |
|---|---|---|
| 1. Reuse | ✓ | No existing glyph reads as "remove the container, keep contents". `IconClose` (✕) already means plain delete (frame + contents); reusing it would make the two destructive bar actions visually identical. `IconFrame` means "a frame" (used by add). Neither fits. |
| 2. Extend | ✓ | Icons are atomic stroke glyphs — nothing to extend; a variant prop on `IconClose`/`IconFrame` would overload unrelated semantics. |
| 3. Grew | ✅ | Add one `IconUngroup` const following the shared `SvgRoot` pattern. |
| 4. Escape | ✗ | The glyph is needed on the QuickActionBar now and the command palette / tooltips reuse the same metadata icon — a shared primitive beats an app-local one-off. |

## Context

WI-050 adds a second frame-scoped destructive action to the QuickActionBar:
"delete frame, **keep children**" (reparent the frame's children to the root
design, then remove the frame). It sits next to the existing plain delete
(`frame.delete`, `IconClose`/✕). The two must be visually distinct at a glance,
otherwise the user can't tell "delete everything" from "release the contents".

## Decision

```tsx
export const IconUngroup = forwardRef<SVGSVGElement, IconProps>(
  function IconUngroup(props, ref) {
    return (
      <SvgRoot ref={ref} {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="2.5 2.5" />
        <rect x="6" y="6" width="6" height="6" rx="1" />
        <rect x="12" y="12" width="6" height="6" rx="1" />
      </SvgRoot>
    );
  },
);
```

- **Metaphor**: a **dashed** outer container (the frame being dissolved) with two
  **solid** children that remain — "the box goes away, the contents stay".
- Same `SvgRoot` contract as every other glyph: viewBox 24×24, stroke-only,
  `currentColor`, `baseProps` shared, `size` prop.
- Distinct from `IconClose` (✕ = delete all) and `IconFrame` (solid frame = a
  container). The dashed stroke is the differentiator carrying the "removed"
  meaning.
- Used by the bar (`renderItem` maps `frame.removeKeepingChildren` → `IconUngroup`)
  and surfaced in the command tooltip / palette via the command metadata.

### No emoji

Per the workspace "no emoji in UI — always icons" rule, the action ships as an
SVG icon from the first commit; no interim text/emoji glyph.

### Tree-shake (DR-002 3 gates)

ESM only / `sideEffects: false` / no reflect-metadata / named const export — all
satisfied (same as every sibling icon).

### Bundle estimate

~0.2 KB gz (three SVG primitives, no new runtime dependency).

## Verification

- typecheck (design-system + web): see WI-050 verification
- declarativecheck (Rule 6) / puritycheck: see WI-050
- e2e `frame-dissolve.spec.ts`: bar-button + Cmd+Backspace dissolve, plus
  Cmd+Z restore / Cmd+Shift+Z redo (runtime proof the glyph's action works).

## Review-by

- `design-system-agent` — primitive promotion + glyph distinctness vs `IconClose`

## Status

**Decided & implemented 2026-05-29.** Lands in the same change as WI-050.
