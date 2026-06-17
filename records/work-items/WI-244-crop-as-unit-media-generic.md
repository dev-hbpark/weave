# WI-244 — Crop as a weave-local UNIT + media-generic crop + video crop

## Metadata

| Field | Value |
|---|---|
| ID | WI-244 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **IN PROGRESS** |
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

## Verification (per slice)

`tsc --noEmit` + full unit suite green after each slice; biome clean on changed
files; `crop-window` reader unit test; image-crop e2e stays green; video-crop e2e
added. Behavior-neutral for image until Slice 4 strips the attr on re-save.
