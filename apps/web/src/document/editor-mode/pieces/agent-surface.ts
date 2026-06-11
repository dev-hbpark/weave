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
import { clampFrameToPage } from "../../page-clamp.js";
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

/** WI-169 — add-time soft min-overlap, as a parent-ratio constant. The drag
 *  clamp (D6) derives ~48 design px from the live page DOM rect; mapInput is
 *  pure (no DOM), so the agent add uses a fixed ratio of the same order
 *  (48px on a 720–1280px page ≈ 0.04–0.07). Bleed stays allowed — only a
 *  fully-off-page (clip-invisible, chrome-only) landing is unrepresentable. */
const AGENT_ADD_MIN_OVERLAP = 0.05;

/** `intoActivePage` + the D6 soft clamp at ADD time (WI-169): when the add
 *  lands on the ACTIVE PAGE and carries an absolute frame, clamp x/y so at
 *  least `AGENT_ADD_MIN_OVERLAP` of the item stays inside the page box —
 *  the page clips at its edge (DR-111 D5), so an off-page add is invisible
 *  content under visible (body-portal'd) selection chrome: the "Aku editing
 *  in the gray matte" failure mode. Frames INSIDE other containers are left
 *  alone (their geometry is unknown to a pure mapInput). */
export function intoActivePageClamped(input: unknown, host: AgentHostContext): unknown {
  const retargeted = intoActivePage(input, host);
  if (
    host.activeContainerId === undefined || // degenerate host — no page box to clamp against
    !isRecord(retargeted) ||
    retargeted["containerId"] !== host.activeContainerId
  ) {
    return retargeted;
  }
  const frame = retargeted["frame"];
  if (
    !isRecord(frame) ||
    typeof frame["x"] !== "number" ||
    typeof frame["y"] !== "number" ||
    typeof frame["width"] !== "number" ||
    typeof frame["height"] !== "number" ||
    !Number.isFinite(frame["x"]) ||
    !Number.isFinite(frame["y"])
  ) {
    return retargeted;
  }
  const clamped = clampFrameToPage(
    {
      x: frame["x"],
      y: frame["y"],
      width: frame["width"],
      height: frame["height"],
    },
    { minX: AGENT_ADD_MIN_OVERLAP, minY: AGENT_ADD_MIN_OVERLAP },
  );
  if (clamped.x === frame["x"] && clamped.y === frame["y"]) return retargeted;
  return { ...retargeted, frame: { ...frame, x: clamped.x, y: clamped.y } };
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
      "ADD a new item (frame / text / image / video / shape / line / qr / embed) into the CURRENT PAGE or a container frame inside it. Omit containerId → the current page; pass containerId only to target a specific frame INSIDE the page. This tool never creates pages — to add a NEW page/slide use weave.page.add; NEVER lay slides out side-by-side as frames (frame coords are 0..1 RELATIVE TO THE PAGE and anything outside is CLIPPED at the page edge — invisible). For a chart use weave.chart.add. Pass frame for the 0..1 box, attrsOverride for per-kind content/style, and units to style it (fill/shadow/…) in the SAME call. CHECK THE TARGET CONTAINER'S LAYOUT FIRST (read it from the snapshot): if the container is ABSOLUTE (no auto-layout) you MUST pass a frame with width>0 AND height>0 — an absolute parent does NOT auto-position its children, so a missing/zero frame lands the item at zero size = invisible & uneditable. If the container has an AUTO-LAYOUT (flex/grid), OMIT the frame — the layout positions and sizes the child; do not fight it with an absolute frame. Do not assume a container is grid; verify.",
    ),
  mapInput: intoActivePageClamped,
};

/** weave.page.add — the page-creation tool. WI-184 ⑩ promoted it from an
 *  agent-surface alias over weave.item.add to a REAL command (rail-"+"
 *  parity is now structural: both paths exec the same command, which stamps
 *  the WI-169 FULL_FRAME page-box lock itself and slots the new page right
 *  AFTER the current one in presentationOrder, one transaction).
 *  `activatesPage` still carries the second half (clone becomes the current
 *  page). `afterId` is stamped from the host's active page — not agent-
 *  addressable (the agent's model is "new slide after the current one",
 *  same as every rail user's). */
const PAGE_PAGE_ADD: AgentToolAdapter = {
  exposedName: "weave.page.add",
  command: "weave.page.add",
  activatesPage: true,
  schema: (base) => {
    const b = requireBase("weave.page.add", base);
    const baseProps = b.inputSchema["properties"];
    const props: Record<string, unknown> = {};
    if (isRecord(baseProps)) {
      // Argument shapes stay the base's by reference (no hand-copied drift);
      // afterId is stamped by mapInput and not agent-addressable.
      for (const key of ["attrsOverride", "units"]) {
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
          "ADD a NEW page (slide) to the design, right after the current page. The page is always created at full design size and immediately becomes the CURRENT page — content added right after (weave.item.add with containerId omitted) lands on it. Optional attrsOverride/units style the page background in the same call. This is the ONLY way to create a page on this design.",
      },
    };
  },
  mapInput: (input, host) => {
    const base = isRecord(input) ? input : {};
    return { ...base, afterId: host.activeContainerId };
  },
};

/** weave.chart.add — same container semantics as item.add (WI-167's gap class,
 *  now expressed structurally instead of via guard enlistment). */
const PAGE_CHART_ADD: AgentToolAdapter = {
  exposedName: "weave.chart.add",
  command: "weave.chart.add",
  schema: (base) => withPageContainerNote(requireBase("weave.chart.add", base)),
  mapInput: intoActivePageClamped,
};

/** weave.page.duplicate — pass-through command, but the clone becomes the
 *  ACTIVE page (rail parity: DesignPage onDuplicatePage selects + activates
 *  the clone). WI-169. */
const PAGE_PAGE_DUPLICATE: AgentToolAdapter = {
  exposedName: "weave.page.duplicate",
  command: "weave.page.duplicate",
  activatesPage: true,
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
  // weave.preset.insertSlide is EXCLUDED (WI-169): preset roots are
  // mixed-canvas boxes ({x:0.3, y:0.3, 0.4×0.4} at the design root) — on a
  // page-bounded format that lands a "page" at an offset, breaking the
  // FULL_FRAME stacking model. Its label ("슬라이드 추가") also out-competes
  // weave.page.add for "new slide" intents. Page creation has ONE path here.
  "weave.clipboard.copy",
  "weave.clipboard.cut",
  "weave.item.duplicate",
  "weave.items.duplicate",
  // WI-185 ⑬ — explicit-delta clone. Item-level and flavor-neutral: clones
  // land beside their source INSIDE the page; the ratio delta is the page's
  // own coordinate space. Useful for rhythmic series on a slide.
  "weave.items.duplicateWithDelta",
  // weave.page.duplicate is enlisted as an ADAPTER (PAGE_PAGE_DUPLICATE) —
  // same command, plus clone activation (WI-169).
  "weave.frame.setLayout",
  "weave.item.setLayoutChild",
  "weave.item.swapGridCells",
  "weave.item.swapFlexOrder",
  "weave.item.dropGridCell",
  "weave.item.setDecoration",
];

/** Page-editing prompt fragment — short by design: the wrapped tools carry
 *  the model (containerId semantics live in the schemas, page creation in the
 *  weave.page.add tool name), so the prompt only anchors the LIVE state plus
 *  the one judgment rule the schemas can't express (WI-170): a request that
 *  does not explicitly target EXISTING content defaults to a NEW page. */
export function pagePromptFragment(host: AgentHostContext): string {
  if (host.activeContainerId === undefined) {
    return "\n\n[페이지 편집] 이 디자인은 페이지(슬라이드) 단위로 편집합니다. 아직 활성 페이지가 없으니 먼저 weave.page.add 로 페이지를 만든 뒤 그 안에 콘텐츠를 넣으세요. 페이지를 추가하면 그 페이지가 곧바로 현재 페이지가 됩니다.";
  }
  return `\n\n[페이지 편집] 이 디자인은 페이지(슬라이드) 단위로 편집 중이며 현재 활성 페이지 frame id는 ${host.activeContainerId} 입니다. containerId 를 생략하면 현재 페이지에 들어갑니다. 새 페이지(슬라이드)는 weave.page.add 로만 추가하세요 — 추가하면 그 페이지가 곧바로 현재 페이지가 됩니다. 슬라이드를 frame 으로 나란히 배치하지 마세요(페이지 좌표는 0..1, 밖은 클립되어 보이지 않습니다). 기본 판단 규칙: 요청이 기존 아이템·페이지의 수정/변경/삭제를 명시하거나 현재 페이지를 직접 가리키지 않는 한, 새 콘텐츠·디자인 요청은 새 페이지에서 작업합니다 — 스냅샷 기준 활성 페이지가 비어 있으면 그 페이지를 그대로 쓰고, 이미 콘텐츠가 있으면 weave.page.add 로 새 페이지를 만든 뒤 그 안에서 작업하세요. 기존 페이지의 콘텐츠 위에 겹쳐 추가하지 마세요.`;
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
    PAGE_PAGE_DUPLICATE,
    PAGE_CHART_ADD,
    PAGE_PASTE,
    PAGE_REPARENT,
    PAGE_BATCH,
  ],
  promptFragment: pagePromptFragment,
};
