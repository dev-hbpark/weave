// WI-051 follow-up — a single host-side accessor for the current design-plane px
// dimensions. Command-layer measurement (paste / reparent) needs the design basis to
// resolve ratio↔px, but those command inputs don't carry it (unlike item.add /
// frame-resize). DesignPage publishes the live design size here; the measurement
// helpers read it. Module-global (weave is an app — allowed) + last-writer-wins; one
// design surface is mounted at a time.

let current: { readonly w: number; readonly h: number } | undefined;

/** Publish the live design-plane px size (DesignPage). */
export function setDesignDims(w: number, h: number): void {
  current = w > 0 && h > 0 ? { w, h } : undefined;
}

/** The current design-plane px size, or undefined before a design surface mounts. */
export function getDesignDims(): { readonly w: number; readonly h: number } | undefined {
  return current;
}
