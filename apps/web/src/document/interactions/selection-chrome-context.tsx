// DR-018 — SelectionChromeRegistry context.
//
// Exposes the per-session registry to descendants so NestedFrame /
// CanvasBlock / future selection consumers can resolve handle specs
// for their current selection without prop-drilling. Plugins / domain
// extensions register their view-models via the same registry.

import type { SelectionChromeRegistry } from "@agocraft/editor";
import { createContext, type ReactNode, useContext } from "react";

const SelectionChromeContext = createContext<SelectionChromeRegistry | null>(null);

export function SelectionChromeProvider({
  registry,
  children,
}: {
  readonly registry: SelectionChromeRegistry;
  readonly children: ReactNode;
}) {
  return (
    <SelectionChromeContext.Provider value={registry}>
      {children}
    </SelectionChromeContext.Provider>
  );
}

export function useSelectionChromeOrNull(): SelectionChromeRegistry | null {
  return useContext(SelectionChromeContext);
}
