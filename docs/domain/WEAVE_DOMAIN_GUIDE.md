# WEAVE — Domain Guide

> Editor + presentation tool domain knowledge for weave.
> Last updated: 2026-05-30. Paths are project-anchored to `workspace/weave/`.

## 0. One-line identity

**A free-canvas editor (Figma) fused with an interactive presentation tool (Prezi · Genially).** One "design" is simultaneously the edit target and the presentation deck — there is no separate export step.

---

## 1. Document model

- **Tree**: `Design(root) → frame → item …` — frames nest to arbitrary depth.
- **Coordinate system (load-bearing)**: every `attrs.frame = { x, y, width, height, rotation }`. `x/y/width/height` are **0..1 ratios of the parent box** (root parent = the whole design); `rotation` is radians about the center. **There are no pixel coordinates.**
- **Unit split**: frames are ratios, but **typography sizes (`fontSize`, `letterSpacing`, paragraph spacing/indent, `lineHeightSpec` px) are absolute design-px**. The canvas px size is injected per task via the `[디자인]` line.
- **Item kinds**: `frame · text · image · video · shape · qr`.
- **Units (per-item attachments)**, two families: **decoration** (visual styling) + **behavior** (presentation interactivity).
- **Serialization**: `onUnknown: "preserve"` — unknown / disabled-feature data survives a write-read cycle losslessly (round-trip identity); `schemaVersion` drives migration.

Source: `apps/web/src/document/types.ts`, `@agocraft/core` `schema/builtin-kinds.ts`.

---

## 2. Editor domain

### 2.1 Per-item characteristics
| Kind | Notes |
|------|-------|
| **frame** | Container; no visual content of its own. A direct child of the design root **IS a slide** (§3). May carry `attrs.layout` to auto-arrange children. |
| **text** | **Auto-height by default.** Two sizing modes: `fontSize` (absolute design-px) or `fontSizeSpec { kind:'ratio', value }` (**0..1 fraction of the PARENT FRAME height** → responsive). Set `frame.width` to control wrapping; height auto-fits. |
| **shape** | 11 sub-kinds: `rectangle · ellipse · line · arrow · triangle · star · polygon` (regular N-gon, `sides`) `· poly` (freeform vertices `points[]`, `closed`) `· path` (raw SVG `d`) `· speech-bubble · heart`. |
| **image / video** | `src`, `fit` (`cover/contain/fill/tile`). |
| **qr** | Regenerates from `attrs.data` on every render; `ecLevel · moduleStyle · margin · foreground/background` (PaintSpec). |

### 2.2 Color / paint — `PaintSpec`
`solid` · **`linear-gradient { angle, stops }`** · **`radial-gradient { cx, cy, stops }`** · `image` · `video` · `none`. Gradients need ≥2 stops. Colors are any CSS color or `var(--token)`.
Source: `@agocraft/core` `visual/types.ts`.

### 2.3 Decoration units (visual styling lives in units, not attrs — DR-028)
`decoration.fill` (PaintSpec) · `decoration.stroke` (`paint · width · dashArray · lineCap · lineJoin`) · **`decoration.shadow` (`x · y · blur · spread · color · inset`)** · `decoration.filter` (`brightness · contrast · saturate · blur · hueRotate`) · `decoration.opacity` (`value 0..1`). Set via `weave.item.setDecoration { itemId, kind, attrs }` (attrs null = clear).

### 2.4 Layout — a subset of CSS flex/grid
| kind | Meaning |
|------|---------|
| `absolute-constraints` | Free placement (default). |
| **`auto-flex`** | CSS Flexbox: `direction · gap · justify · align · padding`; child policy `grow · shrink · basis · alignSelf`. |
| **`auto-grid`** | CSS Grid: `columns/rows` (TrackSize `fr · ratio · auto`) · `columnGap/rowGap · justify · align`; child policy `column · row · columnSpan · rowSpan · alignSelf · justifySelf`. |

Set via `weave.frame.setLayout`; per-child via `weave.item.setLayoutChild`. Source: `@agocraft/core` `layout/{spec,auto-flex-spec,auto-grid-spec}.ts`.

### 2.5 Multi-selection & structural ops
- **Align / distribute** — `weave.items.align` (8 ops: left / h-center / right / top / v-center / bottom / distribute-h · v), within one parent's coordinate space, against the selection bounding box.
- **Bulk edit** — `weave.items.update` (same attrs to many), `weave.items.resizeMulti` (per-item frames), `weave.items.remove / duplicate`.
- **Layout children** — `swapGridCells · swapFlexOrder · dropGridCell`.
- z-order (forward/backward/front/back), `reparent`, `frame.removeKeepingChildren` (dissolve), clipboard, duplicate, preset slide insert.

### 2.6 ⭐ History contract (the editor's core invariant)
- **Every document mutation goes through `editor.exec("weave.<verb>", input)` → `Patch` → `ChangeStream` → `editor.history`.** No direct `setAgoDoc`.
- **One `transactionId` = one undo entry.** `editor.runBatch(fn)` groups multiple `exec` calls into one transaction; the history `mergeWindow` (~500ms, same target) folds a 60Hz drag into one step.
- Guarantee: **"a user can always undo what they just did"** (Cmd+Z / Shift+Cmd+Z).

Source: project `CLAUDE.md` § Document mutation rule; `apps/web/src/document/commands.ts`; `@agocraft/editor` `history.ts`, `transaction-runner.ts`.

---

## 3. Presentation domain

- **A slide = one direct-child frame of the design root.** The deck = the ordered list of those root frames. (A nested frame is a grouping container, not a slide.)
- Deck control: `weave.preset.insertSlide` (add), `weave.design.setPresentationOrder` (order), `weave.design.reorderChildren`.
- **Present mode**: a camera traverses the frames — Prezi-style zoom/pan transitions.

### Behavior units (interactivity — open registry; new kinds add adapters without changing Present code)
| kind | Inspired by | Meaning |
|------|-------------|---------|
| **camera-target** | Prezi | A presentation step. `position (0..1) · scale · order`; `manual` uses position/scale verbatim, else auto-fits the frame. |
| **hotspot** | Genially | Click/hover region → action: `reveal · next-camera · jump-camera · external`. Region in item-local 0..1 (scales with the item). |
| **reveal-on-step** | — | Item stays hidden until a step (0-based camera order), then fades in. |
| hover-effect · button-trigger · entrance-animation | Genially / Prezi | Hover highlight/dim/reveal · whole-frame button · entrance (fade/slide/zoom) at a step. |

→ The design built in the editor **is** the presentation — same document replayed in Present mode.

Source: `apps/web/src/document/types.ts` (`InteractionBehavior`), `apps/web/src/document/render/PresentFrameTree.tsx`.

---

## 4. Agent (Aku) exposure — reverse-MCP

- weave registers ~30 `weave.*` commands on its CommandRegistry → **`connectAgocraftAgent` auto-exposes every one as an MCP tool** to the agent.
- Two grounding layers: **`WEAVE_COMMAND_SCHEMAS`** (argument contracts, highest precedence) + **`WEAVE_CAPABILITIES`** (rendered into the agent's cached system prompt — coordinate/unit/slide/gradient/layout/decoration rules).
- The agent loop runs server-side (small-think); Claude calls weave commands back over the link, so **agent edits flow through `editor.exec` → History exactly like a user action**.

Source: `apps/web/src/features/aku/agent/{weave-command-schemas,weave-capabilities,use-aku-agent}.ts`; `@agocraft/agent-client` `connect.ts`; `@small-think/client` `command-bridge.ts`.

> **Per-round undo grouping (WI-060):** a round of agent tool calls is dispatched **sequentially over the network**, so a synchronous `runBatch` cannot wrap them. The editor exposes an **async-spanning transaction group** (`beginBatch()/endBatch()`, refcounted) and weave drives the agent bridge through a **round-grouping proxy editor** (`features/aku/agent/round-grouping-editor.ts`): it opens a group on the first exec and closes it after an idle gap (`ROUND_IDLE_MS`), so one model round = one Cmd+Z. The group is force-closed on run end / stop / unmount so it never spans past the run. Plural commands (`items.update / align / resizeMulti / remove / duplicate`) remain one undo step on their own.

---

## 5. Operations & security

- **No accounts · shared anonymous workspace**: the deployed instance has every visitor read/write the same `shared:` KV keys. Do not promote to a public sign-up surface before real auth + `user:<uid>:` key namespacing + rate-limit + quota (see `DEPLOY.md`, `apps/web/CLAUDE.md`).
- `window.__weave*` diagnostics are dev-only (gated behind `import.meta.env.DEV`).

---

## 6. Benchmark positioning

The intersection of **Figma** (frames · auto-layout · vector) ∩ **Prezi** (camera-path presentation) ∩ **Genially** (hotspots · interactivity) — "design = presentation," unified into one document and one undo history.
