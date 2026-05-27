// WI-041 — SerializedItem ↔ AgocraftItem structural conversion.
//
// The clipboard pipeline serialises with `@agocraft/core`'s
// `serializeItemSubtree` (string ids, plain shape) and pastes via the
// host reducer's `item.children` + PendingCreations side-channel, which
// expects a full `AgocraftItem` (branded ItemId/UnitId, real `units`,
// recursive `children`). The two shapes are structurally identical —
// only the id brands differ — so a pure recursive cast suffices. We do
// NOT validate `kind` against the host schema here: a payload that
// originated from the same app version is trusted by construction
// (cross-version drift would be caught earlier, by the clipboard
// payload's `schemaVersion` field).

import type { Item as AgocraftItem, SerializedItem, SerializedUnit, Unit } from "@agocraft/core";
import { itemId, unitId } from "@agocraft/core";

export function serializedItemToAgocraft(serialized: SerializedItem): AgocraftItem {
  return {
    id: itemId(serialized.id),
    kind: serialized.kind,
    attrs: serialized.attrs,
    units: serialized.units.map(serializedUnitToAgocraft),
    children: serialized.children.map(serializedItemToAgocraft),
    meta: serialized.meta,
  };
}

function serializedUnitToAgocraft(serialized: SerializedUnit): Unit {
  return {
    id: unitId(serialized.id),
    kind: serialized.kind,
    attrs: serialized.attrs,
    meta: serialized.meta,
  };
}
