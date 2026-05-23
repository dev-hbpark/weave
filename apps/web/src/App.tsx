import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DesignPage } from "./pages/DesignPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { PresentPage } from "./pages/PresentPage.js";

// AITooltipProvider lives inside DesignPage (Phase C of WI-016) — that's
// where the editor and its hotkey table live, and DesignPage is the only
// route with tooltip wiring today. Landing and Present have none.
export function App() {
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
