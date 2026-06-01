// WI-074 / DR-029 D7 — shared flip controls (좌우 / 상하), reused by every
// flippable kind's toolbar section (image / video / shape / line). Toggles the
// generic `transform.flip` unit via `weave.item.flip` per selected item.

import type { Editor } from "@agocraft/editor";
import { Button } from "@weave/design-system";
import type { JSX } from "react";

interface FlipControlsProps {
  readonly editor: Editor;
  readonly ids: ReadonlyArray<string>;
}

export function FlipControls({ editor, ids }: FlipControlsProps): JSX.Element {
  const flip = (axis: "horizontal" | "vertical") => {
    for (const id of ids) editor.exec("weave.item.flip", { itemId: id, axis });
  };
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="md" aria-label="좌우 반전" onClick={() => flip("horizontal")}>
        좌우
      </Button>
      <Button variant="ghost" size="md" aria-label="상하 반전" onClick={() => flip("vertical")}>
        상하
      </Button>
    </div>
  );
}
