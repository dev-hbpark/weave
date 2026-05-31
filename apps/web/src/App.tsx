import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
// Side-effect import — extends agocraft's SubSelectionVariants with
// weave's host-specific variants (canvas-shape / doc-paragraph / hotspot).
// Must execute before any consumer of `vm.subSelection`.
import "./document/agocraft-augmentation.js";
// WI-040 Phase 2 — DEV-only visual demo for the HoverAffordanceLayer
// design review (DR-design-016). The route below is gated on
// `import.meta.env.DEV`; in production builds Vite tree-shakes the
// unreachable branch and drops the demo entry from the bundle.
import { HoverAffordanceLayerDemo } from "./dev/HoverAffordanceLayerDemo.js";
import { bootstrapFromCloud } from "./document/cloud-sync.js";
import { DesignPage } from "./pages/DesignPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { PresentPage } from "./pages/PresentPage.js";

// The single UnifiedTooltip surface (725e0ad — unified AITooltip +
// CursorTooltip + native title into one data-tip surface) is mounted inside
// DesignPage, where the editor + hotkey table live. DesignPage is the only
// route with tooltip wiring; Landing and Present have none.
export function App() {
  // WI-025 — pull cloud designs / resources into localStorage on first
  // mount. The existing sync readers (listAllDesigns / listResources /
  // useDesign) keep working unchanged; they just see a populated LS
  // after bootstrap completes. Failures are silent — local-only mode
  // keeps the app functional.
  useEffect(() => {
    void bootstrapFromCloud();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/design/:id" element={<DesignPage />} />
        <Route path="/design/:id/present" element={<PresentPage />} />
        {import.meta.env.DEV ? (
          <Route path="/_dev/hover-affordance-demo" element={<HoverAffordanceLayerDemo />} />
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
