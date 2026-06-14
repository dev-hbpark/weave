// Scene-geometry bus (WI-217 S3 / DR-138).
//
// The host renderer (`FrameScene`) publishes the engine scene's per-item
// DESIGN-px geometry + direct-child linkage every render; the selection-chrome
// view-models (poly-vertex, corner-radius, layout-edit) read it instead of
// measuring the rendered DOM element (`getComputedStyle` rotation, `offsetWidth`
// unrotated size, `getBoundingClientRect` corner geometry). One geometry owner —
// the engine — for chrome as well as render.
//
// The design→viewport projection (camera pan/zoom + base fit) is read LIVE from
// the `[data-design-plane]` rect: that is the camera transform (a single stable
// container), not per-element geometry, so reading it each rAF keeps chrome
// glued during camera motion without reintroducing the readback the refactor
// removed. Module-level store, consistent with the sibling `snapFeedback` /
// `vertexSelection` stores in this folder.

export interface SceneItemGeom {
  /** Visual centre, design px (every ancestor rotation already composed). */
  readonly cx: number;
  readonly cy: number;
  /** Item box, design px, UNROTATED (rotation-invariant w/h). */
  readonly w: number;
  readonly h: number;
  /** Absolute rotation, radians. */
  readonly rotation: number;
}

interface SceneSnapshot {
  readonly geom: ReadonlyMap<string, SceneItemGeom>;
  /** itemId → ids of its direct children that have a published geom (= rendered
   *  child frames), in document order. Used by layout-edit to place inter-child
   *  boundary lines without querying child DOM boxes. */
  readonly children: ReadonlyMap<string, ReadonlyArray<string>>;
}

const EMPTY: SceneSnapshot = { geom: new Map(), children: new Map() };
let SNAPSHOT: SceneSnapshot = EMPTY;

export function publishSceneGeom(snapshot: SceneSnapshot): void {
  SNAPSHOT = snapshot;
}

export function sceneGeomFor(itemId: string): SceneItemGeom | undefined {
  return SNAPSHOT.geom.get(itemId);
}

export function sceneChildFramesOf(frameId: string): ReadonlyArray<string> {
  return SNAPSHOT.children.get(frameId) ?? [];
}

export interface PlaneProjection {
  /** Design-plane top-left in viewport px (after the camera transform). */
  readonly left: number;
  readonly top: number;
  /** Design→viewport scale (uniform; base fit × camera zoom). */
  readonly scale: number;
}

/** Live design→viewport projection from the `[data-design-plane]` element.
 *  `offsetWidth` is the unscaled CSS width (= designWidth); the rect width is
 *  the scaled on-screen width, so their ratio is the total scale. Returns
 *  undefined before the plane mounts. */
export function planeProjection(): PlaneProjection | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector('[data-design-plane="true"]');
  if (!(el instanceof HTMLElement) || el.offsetWidth <= 0) return undefined;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0)) return undefined;
  return { left: r.left, top: r.top, scale: r.width / el.offsetWidth };
}

/** Project a design-px point to viewport px. */
export function toScreen(
  proj: PlaneProjection,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  return { x: proj.left + x * proj.scale, y: proj.top + y * proj.scale };
}
