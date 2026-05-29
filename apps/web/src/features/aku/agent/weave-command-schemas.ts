// 아쿠 (Aku) — agent command schemas for every weave editing command (WI-054).
//
// weave registers ~29 `weave.*` commands on its CommandRegistry
// (`document/commands.ts`). When that registry is handed to
// `connectAgocraftAgent`, the bridge (`describeCommands` → `createCommandTools`)
// turns EVERY command into an agent tool — so coverage is automatic. These
// schemas are the argument contracts the agent reasons against: passed as
// `connectAgocraftAgent({ schemas })`, they are the highest-precedence layer
// (over `AGENT_COMMAND_SCHEMAS` + any valibot-derived schemas).
//
// The input shapes mirror `document/commands.ts` exactly. Commands absorbed into
// the `@agocraft/core` / `@agocraft/layout` kits (remove / reparent / dissolve /
// duplicate / clipboard / reorder / layout / z-order) share their kit input
// shape — copied here from the kit's own AGENT_COMMAND_SCHEMAS so weave's
// `weave.*` names carry the identical contract.
//
// Two commands (`weave.item.update`, `weave.behavior.update`) take a function
// `patch` in their UI-facing signature, which an agent can't send over JSON.
// `document/commands.ts` accepts a declarative `attrs` / `behavior` alternative
// for exactly this surface (WI-054) — these schemas advertise only the
// declarative form.

import type { AgentCommandSpec } from "@agocraft/agent-client";

// `JsonSchema` is `Readonly<Record<string, unknown>>` (the small-think contract);
// alias it locally so we need no direct @small-think/client dependency.
type Json = Readonly<Record<string, unknown>>;

// ── JSON Schema helpers (mirror the kit's own builders) ──────────────────────
const STR: Json = { type: "string" };
const NUM: Json = { type: "number" };
const STR_ARR: Json = { type: "array", items: { type: "string" } };
/** Open object — the agent supplies a partial attrs/policy bag. */
const ATTRS: Json = { type: "object", additionalProperties: true };

function obj(properties: Readonly<Record<string, Json>>, required: ReadonlyArray<string>): Json {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}

/** Outer frame box — 0..1 ratios of the container (Figma-frame paradigm). */
const FRAME: Json = obj({ x: NUM, y: NUM, width: NUM, height: NUM, rotation: NUM }, [
  "x",
  "y",
  "width",
  "height",
]);

/** The five domain item kinds weave can create (`seed.ts` / mock ADDABLE). */
const ITEM_KIND: Json = {
  type: "string",
  enum: ["frame", "image", "video", "shape", "text"],
};

/** An interaction behavior payload (camera-target / hotspot / …). Open beyond
 *  the required identity fields so new behavior kinds need no schema change. */
const BEHAVIOR: Json = {
  type: "object",
  properties: { id: STR, kind: STR },
  required: ["id", "kind"],
  additionalProperties: true,
};

/** Human labels for the transcript edit-chips (command name → Korean verb).
 *  Reused as each spec's `label`, so the two never drift. */
export const WEAVE_COMMAND_LABELS: Readonly<Record<string, string>> = {
  "weave.item.add": "아이템 추가",
  "weave.item.remove": "아이템 삭제",
  "weave.items.remove": "여러 아이템 삭제",
  "weave.item.update": "아이템 수정",
  "weave.shape.setCornerRadius": "모서리 둥글기",
  "weave.shape.setFill": "채우기 설정",
  "weave.items.resizeMulti": "크기 조정",
  "weave.behavior.update": "동작 수정",
  "weave.doc.reset": "문서 초기화",
  "weave.design.setBackground": "배경색 변경",
  "weave.design.setPresentationOrder": "발표 순서 변경",
  "weave.design.reorderChildren": "순서 변경",
  "weave.item.bringForward": "앞으로",
  "weave.item.sendBackward": "뒤로",
  "weave.item.bringToFront": "맨 앞으로",
  "weave.item.sendToBack": "맨 뒤로",
  "weave.item.reparent": "부모 변경",
  "weave.frame.removeKeepingChildren": "프레임 해제(자식 유지)",
  "weave.item.addBehavior": "동작 추가",
  "weave.item.removeBehavior": "동작 제거",
  "weave.preset.insertSlide": "슬라이드 추가",
  "weave.clipboard.copy": "복사",
  "weave.clipboard.cut": "잘라내기",
  "weave.clipboard.paste": "붙여넣기",
  "weave.item.duplicate": "아이템 복제",
  "weave.items.duplicate": "여러 아이템 복제",
  "weave.frame.setLayout": "레이아웃 설정",
  "weave.item.setLayoutChild": "레이아웃 자식 정책",
  "weave.item.swapGridCells": "그리드 셀 교환",
  "weave.item.swapFlexOrder": "플렉스 순서 교환",
  "weave.item.dropGridCell": "그리드 셀 이동",
};

const label = (name: string): string => WEAVE_COMMAND_LABELS[name] ?? name;

/** Every weave editing command, keyed by its `weave.*` registry name. */
export const WEAVE_COMMAND_SCHEMAS: Readonly<Record<string, AgentCommandSpec>> = {
  // ── lifecycle ──
  "weave.item.add": {
    label: label("weave.item.add"),
    inputSchema: obj({ kind: ITEM_KIND, containerId: STR, frame: FRAME, attrsOverride: ATTRS }, [
      "kind",
    ]),
  },
  "weave.item.remove": {
    label: label("weave.item.remove"),
    destructive: true,
    inputSchema: obj({ itemId: STR, containerId: STR }, ["itemId"]),
  },
  "weave.items.remove": {
    label: label("weave.items.remove"),
    destructive: true,
    inputSchema: obj({ itemIds: STR_ARR }, ["itemIds"]),
  },
  "weave.doc.reset": {
    label: label("weave.doc.reset"),
    destructive: true,
    inputSchema: obj({}, []),
  },

  // ── attrs editing (declarative form — see WI-054 note above) ──
  "weave.item.update": {
    label: label("weave.item.update"),
    // `attrs` is shallow-merged over the item's current attrs. Provide COMPLETE
    // sub-objects (e.g. the full `frame` { x, y, width, height }) — a partial
    // sub-object replaces the whole key. The snapshot gives current values.
    inputSchema: obj({ itemId: STR, attrs: ATTRS }, ["itemId", "attrs"]),
  },
  // ── rectangle corner radius (WI-055) ──
  // Rectangle-only (`shape` item with `subAttrs.shape === "rectangle"`). The
  // radius is in **absolute px** of the shape's rendered bbox — NOT a 0..1
  // ratio (unlike image/frame `borderRadius`). The renderer caps each corner at
  // min(width, height) / 2, so a large value is safe. Send EXACTLY ONE of:
  //   • `radius`  — uniform: all four corners set to this value (0 = square).
  //   • `radii`   — per-corner partial: only the supplied corners change; tl =
  //                 top-left, tr = top-right, br = bottom-right, bl = bottom-left.
  // Sending both, or neither, is rejected with `invalid-input`. A non-rectangle
  // target is rejected with `not-a-rectangle`. The edit is reversible (Cmd+Z).
  "weave.shape.setCornerRadius": {
    label: label("weave.shape.setCornerRadius"),
    inputSchema: obj(
      {
        itemId: STR,
        radius: { type: "number", minimum: 0 },
        radii: {
          type: "object",
          properties: {
            tl: { type: "number", minimum: 0 },
            tr: { type: "number", minimum: 0 },
            br: { type: "number", minimum: 0 },
            bl: { type: "number", minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      // `radius` XOR `radii` is enforced at runtime by the command, not by JSON
      // Schema (which can't express "exactly one of these optional keys").
      ["itemId"],
    ),
  },
  // ── shape fill incl. gradient (WI-056) ──
  // Shape-only. Replaces `attrs.fill` with a `PaintSpec`. The `fill` is a
  // discriminated union on `type`:
  //   • solid           — { type:"solid", color:"#rrggbb" | "#rrggbbaa" | "var(--token)" }
  //   • linear-gradient — { type:"linear-gradient", angle:<deg 0..360, 0=up 90=right>,
  //                         stops:[{ offset:0..1, color:"#rrggbbaa" }, …] }  (≥2 stops)
  //   • radial-gradient — { type:"radial-gradient", cx:0..1, cy:0..1, stops:[…] }  (≥2 stops)
  //   • none            — { type:"none" }  (transparent)
  //   • image | video   — { type:"image"|"video", src:"<url>", fit?, opacity? }
  // Gradient `offset`/`stops[].color` are absolute values, NOT theme tokens.
  // The renderer materializes every variant; a non-shape target → `not-a-shape`.
  "weave.shape.setFill": {
    label: label("weave.shape.setFill"),
    inputSchema: obj(
      {
        itemId: STR,
        fill: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["solid", "linear-gradient", "radial-gradient", "none", "image", "video"],
            },
            // solid
            color: STR,
            // linear-gradient
            angle: NUM,
            // radial-gradient
            cx: NUM,
            cy: NUM,
            // gradient stops (linear + radial)
            stops: {
              type: "array",
              items: obj({ offset: NUM, color: STR }, ["offset", "color"]),
            },
            // image / video
            src: STR,
            fit: STR,
            opacity: NUM,
            muted: { type: "boolean" },
            loop: { type: "boolean" },
          },
          required: ["type"],
          additionalProperties: false,
        },
      },
      ["itemId", "fill"],
    ),
  },
  "weave.items.resizeMulti": {
    label: label("weave.items.resizeMulti"),
    inputSchema: obj(
      {
        updates: {
          type: "array",
          items: obj(
            {
              itemId: STR,
              frame: obj({ x: NUM, y: NUM, width: NUM, height: NUM }, [
                "x",
                "y",
                "width",
                "height",
              ]),
            },
            ["itemId", "frame"],
          ),
        },
      },
      ["updates"],
    ),
  },
  "weave.behavior.update": {
    label: label("weave.behavior.update"),
    // declarative: `behavior` is shallow-merged over the current behavior payload.
    inputSchema: obj({ itemId: STR, behaviorId: STR, behavior: ATTRS }, [
      "itemId",
      "behaviorId",
      "behavior",
    ]),
  },

  // ── design-level ──
  "weave.design.setBackground": {
    label: label("weave.design.setBackground"),
    // null clears the background; a `var(--token)` literal is resolved to a StyleRef.
    inputSchema: obj({ color: { type: ["string", "null"] } }, ["color"]),
  },
  "weave.design.setPresentationOrder": {
    label: label("weave.design.setPresentationOrder"),
    inputSchema: obj({ order: STR_ARR }, ["order"]),
  },
  "weave.design.reorderChildren": {
    label: label("weave.design.reorderChildren"),
    inputSchema: obj({ containerId: STR, order: STR_ARR }, ["order"]),
  },

  // ── z-order ──
  "weave.item.bringForward": {
    label: label("weave.item.bringForward"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  "weave.item.sendBackward": {
    label: label("weave.item.sendBackward"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  "weave.item.bringToFront": {
    label: label("weave.item.bringToFront"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  "weave.item.sendToBack": {
    label: label("weave.item.sendToBack"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },

  // ── structure: reparent / dissolve ──
  "weave.item.reparent": {
    label: label("weave.item.reparent"),
    inputSchema: obj(
      {
        entries: {
          type: "array",
          items: obj({ itemId: STR, newParentId: STR }, ["itemId", "newParentId"]),
        },
        designWidth: NUM,
        designHeight: NUM,
      },
      ["entries"],
    ),
  },
  "weave.frame.removeKeepingChildren": {
    label: label("weave.frame.removeKeepingChildren"),
    destructive: true,
    inputSchema: obj({ frameId: STR, designWidth: NUM, designHeight: NUM }, ["frameId"]),
  },

  // ── behaviors (units) ──
  "weave.item.addBehavior": {
    label: label("weave.item.addBehavior"),
    inputSchema: obj({ itemId: STR, behavior: BEHAVIOR }, ["itemId", "behavior"]),
  },
  "weave.item.removeBehavior": {
    label: label("weave.item.removeBehavior"),
    inputSchema: obj({ itemId: STR, behaviorId: STR }, ["itemId", "behaviorId"]),
  },

  // ── presets ──
  "weave.preset.insertSlide": {
    label: label("weave.preset.insertSlide"),
    inputSchema: obj(
      { presetId: STR, containerId: STR, locale: { type: "string", enum: ["ko", "en"] } },
      ["presetId"],
    ),
  },

  // ── clipboard ──
  "weave.clipboard.copy": {
    label: label("weave.clipboard.copy"),
    inputSchema: obj({ itemIds: STR_ARR }, ["itemIds"]),
  },
  "weave.clipboard.cut": {
    label: label("weave.clipboard.cut"),
    destructive: true,
    inputSchema: obj({ itemIds: STR_ARR, containerId: STR }, ["itemIds"]),
  },
  "weave.clipboard.paste": {
    label: label("weave.clipboard.paste"),
    inputSchema: obj(
      { containerId: STR, containerSizePx: obj({ width: NUM, height: NUM }, ["width", "height"]) },
      ["containerSizePx"],
    ),
  },

  // ── duplicate ──
  "weave.item.duplicate": {
    label: label("weave.item.duplicate"),
    inputSchema: obj({ itemId: STR }, ["itemId"]),
  },
  "weave.items.duplicate": {
    label: label("weave.items.duplicate"),
    inputSchema: obj({ itemIds: STR_ARR }, ["itemIds"]),
  },

  // ── layout (WI-020 / WI-043) ──
  "weave.frame.setLayout": {
    label: label("weave.frame.setLayout"),
    // `layout` is a LayoutSpec object ({ kind: "auto-flex" | "auto-grid" | … });
    // omit it to clear the frame's layout policy.
    inputSchema: obj({ itemId: STR, layout: ATTRS }, ["itemId"]),
  },
  "weave.item.setLayoutChild": {
    label: label("weave.item.setLayoutChild"),
    // `policy` is a LayoutChildPolicy object; omit to clear.
    inputSchema: obj({ itemId: STR, policy: ATTRS }, ["itemId"]),
  },
  "weave.item.swapGridCells": {
    label: label("weave.item.swapGridCells"),
    inputSchema: obj({ aId: STR, bId: STR }, ["aId", "bId"]),
  },
  "weave.item.swapFlexOrder": {
    label: label("weave.item.swapFlexOrder"),
    inputSchema: obj({ aId: STR, bId: STR }, ["aId", "bId"]),
  },
  "weave.item.dropGridCell": {
    label: label("weave.item.dropGridCell"),
    inputSchema: obj({ itemId: STR, x: NUM, y: NUM }, ["itemId", "x", "y"]),
  },
};
