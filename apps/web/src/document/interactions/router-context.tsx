// RouterContext — DR-017 Phase 2.
//
// Exposes the per-session `GestureRouter` to descendants so components
// (FrameStage, RubberBandLayer, CanvasBlock, …) can register their
// bindings without prop-drilling. The router itself is created in
// `useWeaveEditor` alongside editor + vm.

import type { GestureRouter } from "@agocraft/editor";
import { createContext, type ReactNode, useContext } from "react";

const RouterContext = createContext<GestureRouter | null>(null);

export function RouterProvider({
  router,
  children,
}: {
  readonly router: GestureRouter;
  readonly children: ReactNode;
}) {
  return <RouterContext.Provider value={router}>{children}</RouterContext.Provider>;
}

/** Get the active GestureRouter. Returns null when called outside the
 *  provider (read-only PresentPage, tests) so callers can no-op gracefully. */
export function useRouterOrNull(): GestureRouter | null {
  return useContext(RouterContext);
}
