// WI-217 / DR-138 — flat scene renderer. Replaces the recursive `NestedFrame`
// mount: the engine (`@agocraft/layout.computeScene`) flattens the item tree into
// absolute geometry, and this component maps every entry to a `SceneFrame`
// positioned at its design-px transform. DFS pre-order (= paint order) means a
// child still paints on top of its parent even though the DOM is flat (every
// surface absolutely positioned in the design plane; all overflow visible).
//
// The host computes the scene from ONLY the visible top frames (`frames` —
// FrameStage's visibleFrameIds filter), so page-bounded formats render just the
// active page's subtree, identical to the recursive renderer's `frames.map`.

import type { Item as AgocraftItem } from "@agocraft/core";
import { computeScene } from "@agocraft/layout";
import type { ItemFrame } from "../../document";
import type { HitPolicy, RolePolicy } from "../../document/editor-mode/types.js";
import type { FrameStageProps } from "../FrameStage.js";
import { SceneFrame } from "./SceneFrame.js";

interface FrameSceneProps {
  /** Document root (the design canvas). */
  readonly root: AgocraftItem;
  /** Visible top frames (root's direct children, post visibleFrameIds filter). */
  readonly frames: ReadonlyArray<AgocraftItem>;
  /** Design-plane pixel basis the scene composes into. */
  readonly designWidth: number;
  readonly designHeight: number;
  readonly editing: boolean;
  readonly selectedId: string | undefined;
  readonly selectedIds?: ReadonlySet<string>;
  readonly dimmedFrameIds?: ReadonlySet<string>;
  readonly isolatedFrameIds?: ReadonlySet<string>;
  readonly onToggleSelect?: (itemId: string) => void;
  readonly onSelect: ((id: string | undefined) => void) | undefined;
  readonly onUpdateItem: FrameStageProps["onUpdateItem"];
  readonly onUpdateShape: FrameStageProps["onUpdateShape"];
  readonly onRemoveShape: FrameStageProps["onRemoveShape"];
  readonly onDropAdd: FrameStageProps["onDropAdd"];
  readonly onDragOver: FrameStageProps["onDragOver"];
  readonly renderFrameMenu: FrameStageProps["renderFrameMenu"];
  readonly onCommitFrame:
    | ((itemId: string, next: ItemFrame, sessionId?: string) => void)
    | undefined;
  readonly selectedHotspotId: string | undefined;
  readonly onSelectHotspot: ((hotspotId: string | undefined) => void) | undefined;
  readonly onCommitHotspotRegion:
    | ((
        itemId: string,
        hotspotId: string,
        region: { x: number; y: number; width: number; height: number },
      ) => void)
    | undefined;
  readonly onContextMenuRequest?:
    | ((itemId: string, clientX: number, clientY: number) => void)
    | undefined;
  readonly artboardId?: string | undefined;
  readonly roles: RolePolicy;
  readonly hit: HitPolicy;
}

export function FrameScene(props: FrameSceneProps) {
  const { root, frames, designWidth, designHeight } = props;
  // computeScene is O(N) pure math, cheap to run each tick; the SceneFrame.memo
  // (item ref + primitive geometry props) keeps unchanged frames from re-rendering
  // despite the fresh scene object (preserves the WI-198 perf property).
  const scene = computeScene({ ...root, children: [...frames] }, designWidth, designHeight);

  // Flat itemId → Item lookup over the visible subtrees (entries carry only ids).
  const itemById = new Map<string, AgocraftItem>();
  const walk = (it: AgocraftItem): void => {
    itemById.set(String(it.id), it);
    for (const c of it.children) walk(c);
  };
  for (const f of frames) walk(f);

  return (
    <>
      {scene.entries.map((e) => {
        const item = itemById.get(String(e.itemId));
        if (item === undefined) return null;
        return (
          <SceneFrame
            key={String(e.itemId)}
            item={item}
            cx={e.center.x}
            cy={e.center.y}
            w={e.box.w}
            h={e.box.h}
            rotation={e.rotation}
            parentHeight={e.parentHeight}
            editing={props.editing}
            selectedId={props.selectedId}
            {...(props.selectedIds !== undefined ? { selectedIds: props.selectedIds } : {})}
            {...(props.dimmedFrameIds !== undefined
              ? { dimmedFrameIds: props.dimmedFrameIds }
              : {})}
            {...(props.isolatedFrameIds !== undefined
              ? { isolatedFrameIds: props.isolatedFrameIds }
              : {})}
            {...(props.onToggleSelect !== undefined
              ? { onToggleSelect: props.onToggleSelect }
              : {})}
            onSelect={props.onSelect}
            artboardId={props.artboardId}
            roles={props.roles}
            hit={props.hit}
            {...(props.onContextMenuRequest !== undefined
              ? { onContextMenuRequest: props.onContextMenuRequest }
              : {})}
            onUpdateItem={props.onUpdateItem}
            onUpdateShape={props.onUpdateShape}
            onRemoveShape={props.onRemoveShape}
            onDropAdd={props.onDropAdd}
            onDragOver={props.onDragOver}
            renderFrameMenu={props.renderFrameMenu}
            onCommitFrame={props.onCommitFrame}
            selectedHotspotId={props.selectedHotspotId}
            onSelectHotspot={props.onSelectHotspot}
            onCommitHotspotRegion={props.onCommitHotspotRegion}
          />
        );
      })}
    </>
  );
}
