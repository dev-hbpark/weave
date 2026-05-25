import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
// Side-effect import — extends agocraft's SubSelectionVariants with
// weave's host-specific variants (canvas-shape / doc-paragraph / hotspot).
// Must execute before any consumer of `vm.subSelection`.
import "./document/agocraft-augmentation.js";
import { bootstrapFromCloud } from "./document/cloud-sync.js";
import { DesignPage } from "./pages/DesignPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { PresentPage } from "./pages/PresentPage.js";

// AITooltipProvider lives inside DesignPage (Phase C of WI-016) — that's
// where the editor and its hotkey table live, and DesignPage is the only
// route with tooltip wiring today. Landing and Present have none.
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
