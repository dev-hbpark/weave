import { createContext, type ReactNode, useContext } from "react";
import type { PresentContext } from "./types.js";

// WI-090 (DR-052 §3) — carries the live `PresentContext` (the read-only handle
// into PresentPage's reducer: step, goToCameraId, reveal, …) down to the
// recursive present-mode renderer so `ItemInteractionLayer` can dispatch a
// behavior's action without prop-drilling through `PresentFrameTree`.
//
// `null` outside a presentation surface — the interaction layer renders nothing
// when there is no runtime, so the same renderer stays inert if ever reused in
// a non-present context.

const PresentRuntimeContext = createContext<PresentContext | null>(null);

export function PresentRuntimeProvider({
  value,
  children,
}: {
  readonly value: PresentContext;
  readonly children: ReactNode;
}) {
  return <PresentRuntimeContext.Provider value={value}>{children}</PresentRuntimeContext.Provider>;
}

export function usePresentRuntime(): PresentContext | null {
  return useContext(PresentRuntimeContext);
}
