// EditorVMContext — DR-017 Phase 1/2.
//
// Exposes the per-session `EditorViewModel` to descendants. Created in
// `useWeaveEditor` alongside editor + router and provided once at the
// top of DesignPage. Components read with `useEditorVMOrNull()` and
// degrade to a no-op when outside an editor session (read-only
// PresentPage, tests).

import type { EditorViewModel } from "@agocraft/editor";
import { createContext, type ReactNode, useContext } from "react";

const EditorVMContext = createContext<EditorViewModel | null>(null);

export function EditorVMProvider({
  vm,
  children,
}: {
  readonly vm: EditorViewModel;
  readonly children: ReactNode;
}) {
  return <EditorVMContext.Provider value={vm}>{children}</EditorVMContext.Provider>;
}

export function useEditorVMOrNull(): EditorViewModel | null {
  return useContext(EditorVMContext);
}

export { EditorVMContext };
