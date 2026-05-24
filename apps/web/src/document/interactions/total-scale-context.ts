// Shared on-screen scale context for hit-test gating.
//
// FrameStage publishes the design plane's current effective scale (the
// product of the user's pan-zoom and the drill-in spring) into this
// context. NestedFrame and individual domain renderers (canvas shapes,
// paragraphs, …) subscribe so they can compute their displayed footprint
// and disable pointer-events when it drops below a usable size — clicks
// then pass through to whatever larger surface lives behind.
//
// Lives in its own module (rather than next to FrameStage) so domain
// renderers under `document/domains/` can import the context without
// creating a circular dependency back into `pages/FrameStage`.

import type { MotionValue } from "motion/react";
import { createContext } from "react";

/** Pointer-events hit-test threshold (CSS px on screen). Items whose
 *  displayed width OR height falls below this number stop receiving pointer
 *  events. Centralised here so frame chrome, shapes and inner-item gates
 *  all agree on the same number. */
export const HIT_THRESHOLD_PX = 20;

/** Motion value carrying the design plane's current on-screen scale factor
 *  — i.e. `pan.scale × drill spring scale`. Provider lives in FrameStage;
 *  consumers subscribe via `useMotionValueEvent` (or read once with
 *  `useLayoutEffect` for an initial paint). Null when no FrameStage owns
 *  the tree (e.g. PresentPage's read-only render path, tests). */
export const TotalScaleContext = createContext<MotionValue<number> | null>(null);
