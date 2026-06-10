// WI-166 / DR-114 §2b — the React composition root for editor-mode.
//
// The ONLY React file in `editor-mode/` (everything else is pure data +
// functions). It resolves the flavor through the registry and starts the
// injection chain: React consumers read `useEditorMode()` (or receive
// policies as props from a host that does); deps-`[]` gesture closures use
// `useEditorModeRef()` so they always see the live context without
// re-registering.

import { createContext, type ReactNode, type RefObject, useContext, useRef } from "react";
import type { DocFlavor } from "../types.js";
import { editorModeFor } from "./registry.js";
import type { EditorModeContext } from "./types.js";

const Ctx = createContext<EditorModeContext>(editorModeFor(undefined));

export function EditorModeProvider({
  flavor,
  children,
}: {
  readonly flavor: DocFlavor | undefined;
  readonly children: ReactNode;
}) {
  return <Ctx.Provider value={editorModeFor(flavor)}>{children}</Ctx.Provider>;
}

/** The composed editor-mode context for the current flavor. */
export function useEditorMode(): EditorModeContext {
  return useContext(Ctx);
}

/** Latest-value mirror for stable (deps-`[]`) closures — the same ref
 *  pattern the gesture layer already uses for doc / selection. */
export function useEditorModeRef(): RefObject<EditorModeContext> {
  const ctx = useEditorMode();
  const ref = useRef(ctx);
  ref.current = ctx;
  return ref;
}
