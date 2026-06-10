// WI-168 / DR-115 — AgentSurfacePolicy pieces: the flavor-fit agent command
// surface. The internal command registry stays single (Rule 4 / History) —
// these pieces only decide what the AGENT sees and how its inputs translate.
//
// Free placement exposes everything unchanged (DR-064 stays in force there).
// Page-bounded flavors own a CLOSED allow-list: unsupported operations are
// unrepresentable instead of guarded after the fact (the WI-167 recurrence
// class — a forgotten guard enlistment — is removed structurally), and the
// "최상위 frame = 새 슬라이드" model is carried by a dedicated wrapped tool
// (weave.page.add) instead of prompt teaching.
//
// Pure data + pure functions only. Consumers never import this file
// (DR-114 §2b) — the façade (features/aku/agent/agent-surface.ts) receives a
// composed AgentSurfacePolicy via injection and resolves it at connect time.
// `schema` overlays are functions of the internal command's BASE spec so this
// module never imports the app-layer schema catalogue (the façade passes the
// base in — layering stays document ← features).

import type { AgentCommandSpec } from "@agocraft/agent-client";
import { FULL_FRAME } from "../../types.js";
import type { AgentHostContext, AgentSurfacePolicy, AgentToolAdapter } from "../types.js";

/** Free placement (mixed / canvas-board): the full registered command set,
 *  pass-through — byte-identical to the pre-DR-115 surface (no regression). */
export const FREE_AGENT_SURFACE: AgentSurfacePolicy = {
  tools: "all",
};

// ── input translation helpers (pure) ───────────────────────────────────────

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === "object" && v !== null;
}

/** Resolve an omitted-or-root `containerId` onto the ACTIVE PAGE. Pure — no
 *  document access: a degenerate host (empty deck, no active page) leaves the
 *  input unchanged and the internal command's own validation applies. An
 *  explicit non-root containerId is respected (a frame inside the page). */
export function intoActivePage(input: unknown, host: AgentHostContext): unknown {
  if (!isRecord(input) || host.activeContainerId === undefined) return input;
  const containerId = input["containerId"];
  if (containerId !== undefined && containerId !== host.rootId) return input;
  return { ...input, containerId: host.activeContainerId };
}

// ── schema overlay helpers (pure) ───────────────────────────────────────────

/** Loud-fail at connect: an adapted command MUST have a base schema in the
 *  catalogue — silently exposing a tool without an argument contract is the
 *  schema-drift failure mode DR-039 exists to prevent. */
function requireBase(command: string, base: AgentCommandSpec | undefined): AgentCommandSpec {
  if (base === undefined) {
    throw new Error(
      `agent-surface: no base schema for adapted command "${command}" — ` +
        "every adapter resolves its overlay against the catalogue entry (DR-115 §2b)",
    );
  }
  return base;
}

/** Replace the top-level inputSchema.description (argument shape stays the
 *  base's, by reference — same containment as withKitDesc). */
function withDescription(spec: AgentCommandSpec, description: string): AgentCommandSpec {
  return { ...spec, inputSchema: { ...spec.inputSchema, description } };
}

/** Append the page-bounded containerId semantics to the base description. */
function withPageContainerNote(spec: AgentCommandSpec): AgentCommandSpec {
  const prev = spec.inputSchema["description"];
  const note =
    "containerId: omit → the CURRENT PAGE (never the design root); pass an id only to target a frame INSIDE the page.";
  return withDescription(spec, typeof prev === "string" ? `${prev} ${note}` : note);
}

// ── page-bounded tool adapters (slide-deck / doc-page) ─────────────────────

/** weave.item.add, page semantics: omitted/root container = the current page;
 *  page creation is carved out into weave.page.add (the kind:"frame" root-add
 *  shape is no longer how pages are made on this surface). */
const PAGE_ITEM_ADD: AgentToolAdapter = {
  exposedName: "weave.item.add",
  command: "weave.item.add",
  schema: (base) =>
    withDescription(
      requireBase("weave.item.add", base),
      "ADD a new item (frame / text / image / video / shape / line / qr / embed) into the CURRENT PAGE or a container frame inside it. Omit containerId → the current page; pass containerId only to target a specific frame INSIDE the page. This tool never creates pages — to add a NEW page/slide use weave.page.add. For a chart use weave.chart.add. Pass frame for the 0..1 box, attrsOverride for per-kind content/style, and units to style it (fill/shadow/…) in the SAME call. CHECK THE TARGET CONTAINER'S LAYOUT FIRST (read it from the snapshot): if the container is ABSOLUTE (no auto-layout) you MUST pass a frame with width>0 AND height>0 — an absolute parent does NOT auto-position its children, so a missing/zero frame lands the item at zero size = invisible & uneditable. If the container has an AUTO-LAYOUT (flex/grid), OMIT the frame — the layout positions and sizes the child; do not fight it with an absolute frame. Do not assume a container is grid; verify.",
    ),
  mapInput: intoActivePage,
};

/** weave.page.add — the wrapped page-creation tool. Internally a root-level
 *  full-size frame add (rail-"+" parity: DesignPage onAddPage execs the same
 *  shape), but the agent never needs to learn that equivalence — the tool
 *  NAME carries the model (DR-115 §2b). */
const PAGE_PAGE_ADD: AgentToolAdapter = {
  exposedName: "weave.page.add",
  command: "weave.item.add",
  schema: (base) => {
    const b = requireBase("weave.item.add", base);
    const baseProps = b.inputSchema["properties"];
    const props: Record<string, unknown> = {};
    if (isRecord(baseProps)) {
      // Argument shapes stay the base's by reference (no hand-copied drift);
      // kind/containerId are stamped by mapInput and not agent-addressable.
      for (const key of ["frame", "attrsOverride", "units"]) {
        if (baseProps[key] !== undefined) props[key] = baseProps[key];
      }
    }
    return {
      label: "페이지 추가",
      inputSchema: {
        type: "object",
        properties: props,
        required: [],
        description:
          "ADD a NEW page (slide) to the design. The page is created at full design size — omit frame unless you deliberately want a non-standard page box. Optional attrsOverride/units style the page background in the same call. New content then goes INTO the page via weave.item.add. This is the ONLY way to create a page on this design.",
      },
    };
  },
  mapInput: (input, host) => {
    const base = isRecord(input) ? input : {};
    return {
      ...base,
      kind: "frame",
      containerId: host.rootId,
      frame: base["frame"] ?? FULL_FRAME,
    };
  },
};

/** weave.chart.add — same container semantics as item.add (WI-167's gap class,
 *  now expressed structurally instead of via guard enlistment). */
const PAGE_CHART_ADD: AgentToolAdapter = {
  exposedName: "weave.chart.add",
  command: "weave.chart.add",
  schema: (base) => withPageContainerNote(requireBase("weave.chart.add", base)),
  mapInput: intoActivePage,
};

/** weave.clipboard.paste — a paste with no/root target lands on the current
 *  page (a root paste would be invisible page chrome). */
const PAGE_PASTE: AgentToolAdapter = {
  exposedName: "weave.clipboard.paste",
  command: "weave.clipboard.paste",
  schema: (base) => withPageContainerNote(requireBase("weave.clipboard.paste", base)),
  mapInput: intoActivePage,
};

/** weave.item.reparent — a root newParentId resolves to the current page (the
 *  root is page chrome, not an editing surface); another page's id moves the
 *  item across pages explicitly. */
const PAGE_REPARENT: AgentToolAdapter = {
  exposedName: "weave.item.reparent",
  command: "weave.item.reparent",
  schema: (base) => {
    const b = requireBase("weave.item.reparent", base);
    const prev = b.inputSchema["description"];
    const note =
      "newParentId: the design root is not an editing surface here — a root target resolves to the CURRENT PAGE; to move an item onto another page pass that page's frame id.";
    return withDescription(b, typeof prev === "string" ? `${prev} ${note}` : note);
  },
  mapInput: (input, host) => {
    if (!isRecord(input) || host.activeContainerId === undefined) return input;
    const entries = input["entries"];
    if (!Array.isArray(entries)) return input;
    let changed = false;
    const next = entries.map((entry) => {
      if (isRecord(entry) && entry["newParentId"] === host.rootId) {
        changed = true;
        return { ...entry, newParentId: host.activeContainerId };
      }
      return entry;
    });
    return changed ? { ...input, entries: next } : input;
  },
};

/** Inner-op translation table for weave.batch: the internal batch dispatches
 *  ops against the raw registry (it never re-enters the agent surface), so
 *  the batch adapter translates each op itself — weave.page.add works inside
 *  a batch and inner adds retarget exactly like top-level calls. */
const PAGE_OP_ADAPTERS: Readonly<Record<string, AgentToolAdapter>> = {
  [PAGE_ITEM_ADD.exposedName]: PAGE_ITEM_ADD,
  [PAGE_PAGE_ADD.exposedName]: PAGE_PAGE_ADD,
  [PAGE_CHART_ADD.exposedName]: PAGE_CHART_ADD,
  [PAGE_PASTE.exposedName]: PAGE_PASTE,
  [PAGE_REPARENT.exposedName]: PAGE_REPARENT,
};

const PAGE_BATCH: AgentToolAdapter = {
  exposedName: "weave.batch",
  command: "weave.batch",
  schema: (base) => {
    const b = requireBase("weave.batch", base);
    const prev = b.inputSchema["description"];
    const note =
      "Ops use this surface's tools — weave.page.add is valid inside a batch (e.g. add a page, then fill it… across SEPARATE ops only if ids are needed), and an op's omitted containerId lands on the CURRENT PAGE.";
    return withDescription(b, typeof prev === "string" ? `${prev} ${note}` : note);
  },
  mapInput: (input, host) => {
    if (!isRecord(input)) return input;
    const ops = input["ops"];
    if (!Array.isArray(ops)) return input;
    let changed = false;
    const next = ops.map((op) => {
      if (!isRecord(op)) return op;
      const adapter = PAGE_OP_ADAPTERS[String(op["command"])];
      if (adapter === undefined) return op;
      const mapped =
        adapter.mapInput !== undefined ? adapter.mapInput(op["input"], host) : op["input"];
      if (adapter.command === op["command"] && mapped === op["input"]) return op;
      changed = true;
      return { ...op, command: adapter.command, input: mapped };
    });
    return changed ? { ...input, ops: next } : input;
  },
};

// ── page-bounded surface composition ────────────────────────────────────────

/** Flavor-neutral commands exposed unchanged on page-bounded flavors. This is
 *  a CLOSED allow-list (DR-115 §2d): a new internal command is NOT exposed
 *  here until deliberately enlisted — omission fails safe as "not exposed".
 *  The coverage test (editor-mode/agent-surface.coverage.test.ts) holds this
 *  list ⊆ the registered command set and flags new registrations that were
 *  never triaged. */
const PAGE_PASSTHROUGH_TOOLS: ReadonlyArray<string> = [
  "weave.item.remove",
  "weave.items.remove",
  "weave.item.update",
  "weave.shape.setCornerRadius",
  "weave.image.setCrop",
  "weave.item.flip",
  "weave.shape.setFill",
  "weave.shape.setVertices",
  "weave.items.resizeMulti",
  "weave.items.update",
  "weave.items.lifecycle",
  "weave.behavior.update",
  "weave.doc.reset",
  "weave.design.setBackground",
  "weave.design.setPresentationOrder",
  "weave.design.reorderChildren",
  "weave.item.bringForward",
  "weave.item.sendBackward",
  "weave.item.bringToFront",
  "weave.item.sendToBack",
  "weave.shape.breakToLine",
  "weave.line.closeToShape",
  "weave.frame.removeKeepingChildren",
  "weave.item.addBehavior",
  "weave.item.removeBehavior",
  "weave.dataset.add",
  "weave.dataset.update",
  "weave.dataset.remove",
  "weave.preset.insertSlide",
  "weave.clipboard.copy",
  "weave.clipboard.cut",
  "weave.item.duplicate",
  "weave.items.duplicate",
  "weave.page.duplicate",
  "weave.frame.setLayout",
  "weave.item.setLayoutChild",
  "weave.item.swapGridCells",
  "weave.item.swapFlexOrder",
  "weave.item.dropGridCell",
  "weave.item.setDecoration",
];

/** Page-editing prompt fragment — short by design: the wrapped tools carry
 *  the model (containerId semantics live in the schemas, page creation in the
 *  weave.page.add tool name), so the prompt only anchors the LIVE state. */
export function pagePromptFragment(host: AgentHostContext): string {
  if (host.activeContainerId === undefined) {
    return "\n\n[페이지 편집] 이 디자인은 페이지(슬라이드) 단위로 편집합니다. 아직 활성 페이지가 없으니 먼저 weave.page.add 로 페이지를 만든 뒤 그 안에 콘텐츠를 넣으세요.";
  }
  return `\n\n[페이지 편집] 이 디자인은 페이지(슬라이드) 단위로 편집 중이며 현재 활성 페이지 frame id는 ${host.activeContainerId} 입니다. containerId 를 생략하면 현재 페이지에 들어갑니다. 새 페이지(슬라이드)는 weave.page.add 로 추가하세요.`;
}

/** Page-bounded (slide-deck / doc-page): closed allow-list — every registered
 *  command is either pass-through (flavor-neutral) or wrapped (container
 *  semantics / page creation). Residual limit, accepted in WI-168: mapInput
 *  is pure (no document access), so it cannot detect a destructive op aimed
 *  at the active page itself (e.g. frame.removeKeepingChildren on the page) —
 *  that stays the command's own validation domain. */
export const PAGE_AGENT_SURFACE: AgentSurfacePolicy = {
  tools: [
    ...PAGE_PASSTHROUGH_TOOLS,
    PAGE_ITEM_ADD,
    PAGE_PAGE_ADD,
    PAGE_CHART_ADD,
    PAGE_PASTE,
    PAGE_REPARENT,
    PAGE_BATCH,
  ],
  promptFragment: pagePromptFragment,
};
