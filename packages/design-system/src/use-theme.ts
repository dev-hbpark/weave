import { useCallback, useEffect, useState } from "react";

export type ThemeName = "aurora" | "mono" | "vivid";

const STORAGE_KEY = "weave.theme";
const DEFAULT_THEME: ThemeName = "aurora";

function readStored(): ThemeName {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "aurora" || raw === "mono" || raw === "vivid") return raw;
  return DEFAULT_THEME;
}

function applyToDocument(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

type StartViewTransitionFn = (cb: () => void) => unknown;

export function useTheme(): {
  theme: ThemeName;
  setTheme: (next: ThemeName) => void;
} {
  const [theme, setThemeState] = useState<ThemeName>(() => readStored());

  // Apply on mount + every change. Cheap — single attribute write.
  useEffect(() => {
    applyToDocument(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    // Smooth cross-theme transition via View Transitions API where available.
    // Read the method via a structural cast to avoid declaring a Document subtype
    // that conflicts with lib.dom's standard ViewTransition contract.
    const startVT = (document as { startViewTransition?: StartViewTransitionFn })
      .startViewTransition;
    if (typeof startVT === "function") {
      startVT.call(document, () => {
        setThemeState(next);
      });
    } else {
      setThemeState(next);
    }
  }, []);

  return { theme, setTheme };
}
