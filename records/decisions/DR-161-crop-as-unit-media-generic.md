# DR-161 — Crop as a weave-local UNIT + media-generic crop UI + video crop

## Metadata

| Field | Value |
|---|---|
| ID | DR-161 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **ACCEPTED** |
| Work Item | [WI-244](../work-items/WI-244-crop-as-unit-media-generic.md) |
| Related | DR-028 (decoration/visual as UNITS, no legacy attr fallback), DR-029 / WI-074 (interactive image crop), WI-243/DR-160 (per-item View/ViewModel split), `transform-crop-offset.ts` (`crop.offset` unit precedent) |

## Context

Three operator requests converge on one keystone:

1. The crop UI (`CropEditor`) is buried in `ImageBlock.tsx` and renders `<img>` —
   it should be a shared media component usable by most processable media.
2. Crop should apply to video (and other media), not images only.
3. **The crop window must be stored as a UNIT, not `attrs.cropRatio`.**

(3) is the keystone: units are **kind-agnostic by construction** (any item can
carry an `opacity` / `shadow` / `crop.offset` unit — DR-028). The crop OFFSET is
already a weave-local unit (`crop.offset`, empty schema + `onUnknown: preserve`,
no agocraft registration — `transform-crop-offset.ts`). Only the crop WINDOW
(x/y/w/h/rotation) still lives on `attrs.cropRatio` (image-only, agocraft
`ImageCrop`). Moving it to a unit removes the schema gate that blocks video and
makes (1)+(2) fall out naturally.

The crop subsystem is already ~85% kind-agnostic (store, geometry math,
FrameStage handle dispatch, SceneFrame chrome visibility, `readCropOffset` — all
keyed by item id, no kind check). The image gates are: the `setImageCrop`
command's `kind !== "image"` guard, the `useImageItemViewModel` type, the
`<img>`-only render, and the agent schema docs.

## Decision

### 1. Crop window → weave-local `crop.window` unit

New `crop-window.ts` mirroring `transform-crop-offset.ts`:

```ts
export const CROP_WINDOW_UNIT_KIND = "crop.window";
export interface CropWindow { x; y; w; h; rotation }     // 0..1 + radians
export const IDENTITY_CROP_WINDOW = { x:0, y:0, w:1, h:1, rotation:0 };
export function readCropWindow(item): CropWindow;        // unit ?? legacy attrs.cropRatio ?? identity
```

- **Read**: prefer the `crop.window` unit; **fall back to legacy `attrs.cropRatio`**
  so existing docs render unchanged (back-compat, no separate migration pass).
- **Write**: the commit command writes the `crop.window` unit via
  `setDecorationCommand` (same path the `crop.offset` unit already uses) **and
  strips `attrs.cropRatio`** — so a re-saved doc is fully unit-based (DR-028).
- Empty schema + `onUnknown: preserve` → round-trips with no agocraft change
  (Rule 5), exactly like `crop.offset`. No re-vendor.

### 2. Command: `weave.image.setCrop` → `weave.media.setCrop`, NO kind gate

- The crop is a kind-agnostic unit, so the command has **no kind check at all** —
  it just attaches the `crop.window` unit to the (existing) target item. The sole
  precondition is item-exists; only the media renderers (image / video) read the
  unit, and other kinds round-trip it untouched (`onUnknown: preserve`). (The
  intermediate `kind === "image" || "video"` guard was removed — gating by kind is
  exactly the image-coupling the unit model eliminates.)
- Writes the `crop.window` + `crop.offset` units (one transaction, one undo)
  instead of `attrs.cropRatio`.
- Rename the command (call sites: DesignPage `applyCrop`, editor-hotkeys
  `crop.apply`). Agent schema + capabilities updated from "image only" →
  "image/video".

### 3. Media-generic crop UI

`CropEditor` + the committed-crop render + the shared helpers
(`rotationTransform`, `cropWindowWrapperStyle`, `isIdentity`, `CropRect`) move to
a shared module `domains/media/crop-editor.tsx`. The media element becomes a
**render-prop** `media: (style) => ReactNode` so image passes `<img>` and video
passes `<video>` — the crop framing / pan / dim / two-draw logic is media-agnostic.

### 4. Video crop wiring

The video ViewModel reads the crop window+offset units (kind-agnostic now),
exposes `cropMode` / `onEnterCrop`, and `VideoView` renders the committed crop +
the crop editor through the shared component with a `<video>` media element.
Double-click enters crop; commit/cancel reuse the existing external flow.

## Scope boundary

`crop.window` is a NEW unit; the crop OFFSET unit is unchanged. No agocraft core
change (weave-local units). The reader keeps a legacy `attrs.cropRatio` fallback
(back-compat); writes are unit-only. `transform.flip` stays its own unit (DR-029
D7), not folded in.

## Alternatives considered

- **Keep `attrs.cropRatio`, just un-gate the command to video** — rejected: the
  operator explicitly wants unit storage, and an attr is image-typed in agocraft
  (`ImageCrop` on `ImageAttrs`), so video would need a parallel attr; a unit is
  one kind-agnostic carrier.
- **Fold offset into the new window unit (single `crop` unit)** — rejected for
  now: more migration churn; `crop.offset` already ships and works. Keep two
  units (window + offset), consistent with the current split.
- **Migrate-on-load pass (lift `attrs.cropRatio` → unit)** — deferred: the
  read-fallback covers back-compat with less risk; a sweep can follow if we want
  to retire the attr read entirely.

## Consequences

- Crop is kind-agnostic at the data layer → video (and future media) croppable
  with no schema gate.
- `CropEditor` is a reusable media component (render-prop), not image-bound.
- One more weave-local unit; round-trips via `onUnknown: preserve`.
- Old docs render via the legacy-attr fallback; re-saving migrates them to the unit.

## Verification

- `crop-window.ts` unit reader test (unit > legacy attr > identity precedence).
- `tsc --noEmit` clean; full unit suite green.
- e2e: image crop (existing `image-crop*` specs) stays green; a video-crop spec
  added (enter → pan → commit writes the `crop.window` unit → re-render).
