// WI-070 — the host's single snap provider registry (mirrors HANDLE_INTERACTIONS
// in `handle-gesture-runner.ts`). Every snap SITUATION registers ONE provider
// here; every drag CONSUMER calls `collectTargets` + `resolveSnap`. Phase 1 ships
// the endpoint-close provider; alignment-guide / equal-spacing / edge-midpoint /
// grid providers register here later with NO engine or consumer change (Rule 5).

import { createSnapProviderRegistry } from "@agocraft/core";

export const SNAP_PROVIDERS = createSnapProviderRegistry();
