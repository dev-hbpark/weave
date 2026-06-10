// 아쿠 (Aku) — agent-only page-target retarget (WI-153 P4 / DR-111 D5).
//
// PROBLEM: on page-bounded formats (slide-deck / doc-page) the canvas renders
// ONE active page at a time. The doc root is page chrome there, not an editing
// surface — an agent `weave.item.add` that lands a LEAF (text / shape / image /
// …) at the root creates an item the user can never see or select (only the
// active page's subtree renders). The agent has no notion of the host's
// "active page", so it defaults containerId to the root constantly.
//
// FIX: this pure input transform runs ONLY on the agent's exec path (the
// round-grouping proxy's `transformInput`, like the WI-150 container guard).
// When the host advertises a default add container (= the active page id,
// supplied only by page-bounded formats) and the add targets the root
// (explicitly or by omission), the containerId is rewritten to that page.
//
// EXEMPTION — `kind: "frame"` adds stay at the root: on a slide-deck a
// top-level frame IS a new page/slide, the one legitimate root add (the rail's
// "+" uses the same shape). Retargeting it would nest pages inside pages.
//
// The toolbar/drop paths never go through this proxy; their retarget lives in
// the host (use-item-add / DesignPage onDropAdd) with the same policy source
// (FORMAT_EDITOR_CONFIG.defaultContainer — there is deliberately NO separate
// `agentRootAdd` registry field; it would always mirror `defaultContainer`).

/** Retarget an agent `weave.item.add` aimed at the doc ROOT into the host's
 *  default add container (the active page on page-bounded formats).
 *  No-op when: not item.add, non-object input, no default container,
 *  container is already a non-root frame, or the add is itself a frame
 *  (= a new page — the legitimate root add). Pure. */
export function retargetAgentRootAdd(
  commandName: string,
  input: unknown,
  rootId: string,
  defaultContainerId: string | undefined,
): unknown {
  if (commandName !== "weave.item.add") return input;
  if (defaultContainerId === undefined || defaultContainerId === rootId) return input;
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  if (record.kind === "frame") return input;
  const containerId = record.containerId;
  const targetsRoot = containerId === undefined || containerId === rootId;
  if (!targetsRoot) return input;
  return { ...record, containerId: defaultContainerId };
}
