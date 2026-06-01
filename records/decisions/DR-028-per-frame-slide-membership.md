# DR-028 — Per-frame slide (deck) membership toggle

## Status

Accepted (2026-06-01). Implements part of WI-072. Supersedes the implicit
"every frame at any depth IS a slide" rule (Phase 11/12) for the nesting era.

## Context

Enabling frame nesting (WI-072) raised: should a nested frame be a presentation
slide? Today `collectPresentationIds` recurses all depths, so every frame is a
deck step (asserted by its test). With nesting, a frame is often a GROUP
container, not a slide. User decision: make deck membership a **per-frame user
choice**, defaulting to **included** (preserve current behavior), and show
non-slide frames **differently** in the thumbnail panel (a separate section).

## Decision

- **Storage**: frame `attrs.presentable: boolean`. Absent / `true` ⇒ slide
  (default). `false` ⇒ group (excluded from the deck). Round-trips through the
  agocraft mirror/serialization (verified: a `weave.item.update` setting it
  persists and is read back).
- **Filter**: `isPresentableFrame(item)` = frame-kind AND `presentable !== false`.
  `collectPresentationIds` pushes only presentable frames (still recurses into
  opted-out frames so a slide nested in a group still counts).
  `collectNonSlideFrameIds` lists the opted-out frames. Present mode + thumbnail
  order both flow through `effectivePresentationOrder`, so the one filter covers
  deck navigation, thumbnails, and step list.
- **Default preserved**: with no flag set, behavior is identical to before — the
  existing `collectPresentationIds` test (nested frames are slides) stays green.
- **Thumbnail panel**: opted-out frames render in a separate dashed "그룹"
  section (no slide number, dimmed), still selectable; a per-tile toggle (slide
  tile → exclude, group tile → re-include) calls `onToggleSlide(id, presentable)`.
- **QuickActionBar**: `frame.toggleSlide` command (frame-only) dispatched via the
  `frameSlideToggler` host slot, flipping the live `presentable`.
- **Mutation path**: both toggles go through `weave.item.update` so the change is
  one undoable history step (no direct doc mutation).

## Alternatives rejected

- **All frames = slides (keep Phase 11)**: the user initially chose this, then
  refined to a per-frame toggle — a nested group frame becoming a deck slide is
  surprising.
- **Top-level frames only = slides**: would silently drop nested frames from a
  deck that intentionally nested slides; less flexible than an explicit per-frame
  flag.

## Verification

e2e `frame-nested-container.spec.ts` ⑤: excluding a frame moves it to the
non-slide section + removes its slide tile; re-including restores it. The toggle
buttons render in both surfaces; the deck filter + thumbnail re-render are the
asserted user-visible outcome.

## Links

- WI-072; agocraft DR-035 (dissolve→parent, the other nesting enabler).
