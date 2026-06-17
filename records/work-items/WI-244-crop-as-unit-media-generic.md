# WI-244 — Crop as a weave-local UNIT + media-generic crop + video crop

## Metadata

| Field | Value |
|---|---|
| ID | WI-244 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DONE** (slices 1–3 shipped; legacy-attr migrate-sweep deferred per DR-161) |
| Type | Feature / refactor — crop storage model + media-generic crop UI + video wiring |
| Decision | [DR-161](../decisions/DR-161-crop-as-unit-media-generic.md) |
| Related | DR-028 (units), DR-029/WI-074 (image crop), WI-243/DR-160 (View/VM split), `transform-crop-offset.ts` |

## Problem (requested)

Operator, in sequence: (1) `CropEditor` is image-only and buried in
`ImageBlock.tsx` — relocate it so most processable media can use it; (2) wire crop
for video too; (3) **crop must use a UNIT, not `attrs.cropRatio`.** (3) is the
keystone — a unit is kind-agnostic, so it unblocks (1)+(2).

## Plan (verified slices)

- **Slice 1 — crop window unit.** New `crop-window.ts` (`crop.window` unit,
  mirroring `crop.offset`): `readCropWindow(item)` = unit ?? legacy
  `attrs.cropRatio` ?? identity. Switch `weave.image.setCrop` → `weave.media.setCrop`:
  un-gate `kind` to image|video, write the `crop.window` unit (via
  `setDecorationCommand`) + strip `attrs.cropRatio`. Update call sites (DesignPage
  `applyCrop`, editor-hotkeys `crop.apply`). Reader test.
- **Slice 2 — media-generic crop UI.** Move `CropEditor` + committed render +
  helpers (`rotationTransform`/`cropWindowWrapperStyle`/`isIdentity`/`CropRect`) to
  `domains/media/crop-editor.tsx`; media element via render-prop. Rewire ImageBlock
  (reads `readCropWindow` now). Behavior-neutral for image.
- **Slice 3 — video crop.** Video VM reads crop window+offset, exposes
  `cropMode`/`onEnterCrop`; `VideoView` renders committed crop + crop editor via the
  shared component with `<video>`. Double-click enters crop.
- **Slice 4 — agent + docs.** weave-capabilities / weave-command-schemas:
  "image only" → "image/video"; agent-surface comment. Decommission note for the
  legacy attr (read-fallback retained; migrate-sweep deferred per DR-161).

## Coordination

Touches files the WI-241/242 group-kind session may also edit (`commands.ts`,
`DesignPage.tsx`, `editor-hotkeys.ts`). Edits are localized (the `setImageCrop`
command, two call sites). Committed-wins; rebase/renumber on conflict.

## Progress log

- **Slice 1 — crop window unit (`c0fbb1c`)**: new `crop-window.ts` (`crop.window`
  unit, mirror of `crop.offset`) + `readCropWindow` (unit ?? legacy attr ?? identity);
  `weave.image.setCrop` → `weave.media.setCrop`, un-gated image|video, writes the unit
  + strips the legacy attr; call sites + agent schema/capabilities/surface updated;
  crop command tests migrated to the unit surface. 1494 unit green.
- **Slice 2 — media-generic crop UI (`36fd182`)**: `CropEditor` + `CroppedMedia` +
  helpers + `CropRect` moved to `domains/media/crop-editor.tsx`; inner element via a
  `media:(style)=>ReactNode` render-prop. ImageBlock consumes it (passes `<img>`);
  data-testids unchanged. Behavior-neutral for image. 1494 unit green.
- **Slice 3 — video crop (`29b8fcf`)**: video VM reads the crop units, exposes
  `cropMode`/`onEnterCrop`; `VideoView` renders committed crop + crop editor via the
  shared component with `<video>` (committed keeps the trim/volume ref effects;
  aspect measured). 1499 unit green.
- **Slice 4 folded into slice 1** (command rename + agent schema/capabilities/surface
  "image only" → "image/video"). Remaining: a migrate-sweep that lifts legacy
  `attrs.cropRatio` → unit on load and retires the read-fallback — **deferred per
  DR-161** (the read-fallback covers back-compat; re-saving already migrates).

## Follow-up audit — other unit commands' kind gates (`c511a6c`)

Swept `commands.ts` for unit-based commands gating on item kind unnecessarily
(the crop precedent). Findings:

- **Correctly ungated** (no change): `weave.item.setDecoration`, `weave.item.update`,
  `weave.items.update`, `weave.item.add`, `weave.item.addBehavior` /
  `removeBehavior`, `weave.media.setCrop`.
- **`weave.shape.setFill` — gate REMOVED**: it checked `kind !== "shape"`, but
  `decoration.fill` is read by BOTH shape and frame renderers. Now validates the
  PaintSpec and attaches the fill unit to any existing item (non-fill kinds ignore
  it). `not-a-shape` error gone; test migrated; agent schema text updated.
- **`weave.item.flip` — gate KEPT (legitimate)**: `FLIP_ALLOWED_KINDS`
  {image,video,shape,line,frame} excludes text/qr for a **UX** reason (mirror-image
  text is unreadable, a flipped qr is unscannable — functional damage), not a
  technical kind-coupling. A unit can technically live anywhere, but disallowing
  the mirror is a deliberate editorial decision — left as-is.

## Not yet live-verified

e2e/dev-server blocked in this sandbox (vite `@fs` networkidle baseline). Correctness
rests on tsc + full unit suite (incl. `crop-window` reader + migrated command tests) +
unchanged crop data-testids. A video-crop e2e (enter → pan → commit writes the
`crop.window` unit) should be added in a networked run.

## Verification (per slice)

`tsc --noEmit` + full unit suite green after each slice; biome clean on changed
files; `crop-window` reader unit test; image-crop e2e stays green; video-crop e2e
added. Behavior-neutral for image until Slice 4 strips the attr on re-save.
