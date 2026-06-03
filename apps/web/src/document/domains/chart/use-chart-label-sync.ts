// WI-078 Phase C (DR-035) — drives chart-label reconciliation. After every doc
// change it applies the `projectAllChartLabels` projection through the host's
// `reconcileDerived` (non-undoable, non-synced derived-state channel). The
// transform returns the SAME doc ref when nothing drifts, so `reconcileDerived`
// no-ops and the effect converges (one projection, then idle). Mounted once on
// the design surface.
//
// `designW`/`designH` (the design's px size) are passed because pie labels sit
// on a px circle — their ratio positions depend on the chart's px aspect, which
// is the design size × the chart frame. They are also effect deps, so resizing
// the design repositions pie labels (bar/line labels are aspect-independent).

import type { Document as AgocraftDocument } from "@agocraft/core";
import { useCallback, useEffect } from "react";
import { projectAllChartLabels } from "./chart-label-sync.js";

export function useChartLabelSync(
  reconcileDerived: (transform: (doc: AgocraftDocument) => AgocraftDocument) => void,
  doc: AgocraftDocument,
  designW: number,
  designH: number,
): void {
  const project = useCallback(
    (d: AgocraftDocument) => projectAllChartLabels(d, designW, designH),
    [designW, designH],
  );
  useEffect(() => {
    reconcileDerived(project);
    // biome-ignore lint/correctness/useExhaustiveDependencies: `doc` is an
    // intentional re-run TRIGGER — each new immutable document snapshot must
    // re-drive the projection. The transform reads the latest doc via
    // `reconcileDerived` (prev.document), so `doc` isn't referenced in the body,
    // but dropping it would stop the controller from reacting to data changes.
  }, [reconcileDerived, project, doc]);
}
