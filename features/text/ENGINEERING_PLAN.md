# Engineering Plan — Text item v1 (Figma-equivalent) — WI-029

| Field | Value |
|---|---|
| Feature | `text` (Figma-equivalent text item with 3-mode resize + rich text per-range) |
| Owner | hbpark |
| Triggering WI | WI-029 |
| Status | **In Progress** — 95% merged (single-session, 2026-05-25). Remaining 5% scoped below. |
| FR verdict | FR-002 = **FEASIBLE WITH TRADE-OFFS** (7 trade-offs sign-off, 3 specialist pending) |
| Risk verdict | RISK-001 = **GO WITH CONDITIONS** (Condition #1 cleared 2026-05-25, 9 remaining) |
| Decisions | DR-015 (Lexical, Accepted 2026-05-25), DR-016 (resize paradigm, Accepted) |
| Cross-project | agocraft WI-016 (Phase 1+2 Done) + HANDOFF-007 (Closed) + HANDOFF-008 (Closed) |
| Last updated | 2026-05-25 |

---

## 1. Feature scope and risks

### Scope (in)

User-facing capabilities at v1 launch:

- 3-mode resize toggle (Auto-W / Auto-H / Fixed) — DR-016 paradigm
- 9 PropertiesPanel controls: Mode, V-Align, Decoration, Case, fontFamily/Weight/Style/Size/Align, lineHeight, letterSpacing, Truncate(+maxLines, Fixed only), Hyperlink
- Rich text per-range via Lexical RichTextPlugin — `Cmd+B / Cmd+I / Cmd+U` native shortcuts, per-range bold / italic / underline / strikethrough / color
- Static rendering of new attrs in read-mode (text-decoration / text-transform / vertical-align / paragraph-spacing / hyperlink wrap / overflow-truncate)
- Korean IME stability via Lexical (Meta facebook/whatsapp prod-verified)
- agocraft Phase 2 sync infrastructure (`item.text` patch + Y.XmlText F2 = root XmlText per-textbox) — wired for collaborative future, gated behind SYNC_ENABLED

### Scope (out / deferred to v2)

Per `docs/product/TEXT_ITEM_SPEC.md` §10:

- Glyph-level `hyperlink` (v1 = box-only)
- `fontWeight` numeric (100~900) — v1 = "normal" / "bold"
- OpenType flags (LIGA / CALT / ...)
- Lists (`lineTypes: ORDERED | UNORDERED`, `lineIndentations[]`)
- Variable text / data-binding
- Text on path
- `lineHeight.unit: "font_size_%"` (Figma's 3rd unit)
- Mobile editing (view-only at launch — FR-001 trade-off)
- Custom font dynamic load (6 presets only)
- Per-word/per-character reveal animations (generic step-reveal exists, text-specific is v2)

### Risks (per RISK-001 — 9 risks × 5 categories, GO WITH CONDITIONS)

| Risk | Severity (w/ controls) | Status |
|---|---|---|
| R1 Editor vendor lock (Lexical = Meta) | Med | Accepted; 6mo dependency-audit + MIT fork plan |
| **R2 Slate fallback IME regression** | **High → unreachable** | **Plan B not triggered** (Lexical PASS 2026-05-25); condition #2 永영 closed |
| R3 Yjs concurrent attribute LWW | Med | Mixed badge UX + disclosure; conditions #3, #9 |
| R4 Migration v6→v7 data loss | High → Med (w/ round-trip vitest + v6 backup) | condition #4 pending (Phase 1.5) |
| R5 React StrictMode singleton dispose | Med → Unlikely | Lexical `useMemo` initialConfig + condition #5 e2e |
| R6 Breaking change (corner-scale 폐기) UX | Low × Likely = Med | condition #6 pending (launch note + tooltip) |
| R7 Lexical single-editor-per-Y.Doc constraint | Low | absorbed via F2 (root XmlText per-textbox) |
| R8 Bundle LCP/INP impact | Low → Unlikely | lazy-load follow-up; condition #7 (≤ 60 KB → revised ≤ 80 KB) |
| R9 HANDOFF-010 delay → schedule | Low | All HANDOFF dependencies Closed |

### Estimate range

- **Total spent**: ~1 dev-day (single-session compression, AI-assisted)
- **Remaining**: 1.5–3 dev-days for 5 follow-up items (see §7 phases)
- **Risk inflation factors**: agocraft Phase 1.5 migration edge cases (text → textRuns), e2e CDP IME edge cases, weave use-design.ts wire-through cross-cutting

---

## 2. Architecture

### Layer diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ weave application (apps/web/)                                        │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ DesignPage                                                       │ │
│ │   ↳ <ContextualToolbar/> ── <TextSection/>   (9 controls)       │ │
│ │   ↳ <FrameStage/> — selection handles dirs mode-gated by         │ │
│ │       textAutoResize (DR-016 mode-gated)                         │ │
│ │   ↳ <TextBlock/> ── edit:  <LexicalTextEditor/>                  │ │
│ │                  ── read:  renderReadOnly(text, textRuns)        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ apps/web/src/document/                                           │ │
│ │   types.ts            — re-export TextAttrs from @agocraft/core  │ │
│ │   seed.ts             — Phase 1 defaults                         │ │
│ │   commands.ts         — weave.text.* + weave.design.* (HANDOFF-7)│ │
│ │   agocraft-mirror.ts  — applyChangeToDocument (Phase 2 + 7 cases)│ │
│ │   domains/                                                       │ │
│ │     TextBlock.tsx                                                │ │
│ │     LexicalTextEditor.tsx                                        │ │
│ │   toolbar/sections/text-section.tsx — 9 PropertiesPanel controls │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ Dependencies (added):                                                 │
│   lexical 0.44.0, @lexical/react 0.44.0, @lexical/selection 0.44.0  │
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ vendor file:tgz (@agocraft/*)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ agocraft (sibling) — 1.0.0-rc.20260525072317                         │
│   @agocraft/core/schema/builtin-kinds — TextAttrs v1 (Phase 1)       │
│       9 helper types + 11 optional fields + factory + getPlainText   │
│   @agocraft/core/command/patch — Patch union (9 variants total)      │
│       + DeltaOp + patchItemId|undefined + patchKey                   │
│   @agocraft/core/change/change  — Change union (matches Patch + 4)   │
│   @agocraft/core/model/document — Document.attrs? (HANDOFF-7)        │
│   @agocraft/core/serialize/serializer — CURRENT_SCHEMA_VERSION=6     │
│       + attrs round-trip                                             │
│   @agocraft/core/errors (× 11) — *_ERROR_CODES (HANDOFF-8)           │
│   @agocraft/editor — invertPatch / changeToPatch / transaction-runner│
│       (9 variants covered)                                           │
│   @agocraft/sync/ydoc-bridge — Y.XmlText integration (F2 option)     │
│       seedTextRuns (idempotent) + decodeItem.textRuns derivation     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data flow

```
User input (edit mode)
  └─ <ContentEditable> (Lexical) — key/IME/paste/drag
      └─ Lexical EditorState mutation (RichTextPlugin handles Cmd+B/I/U)
          └─ OnChangePlugin → readSnapshot()  ┄┄┄ EditorState ↔ textRuns
              └─ TextBlock onChange(snapshot)
                  └─ onUpdate({ text, textRuns })  ┄┄┄ atomic dispatch
                      └─ weave.item.update command (item.attrs patch)
                          └─ editor.exec → ChangeStream → editor.history
                              ├─ applyChangeToDocument → setAgoDoc → re-render
                              └─ (Phase 2+ collaborative): item.text patch
                                  → @agocraft/sync.applyPatchToYDoc
                                  → Y.XmlText.applyDelta
                                  → Y.XmlText observer → derive → host

Mode toggle (PropertiesPanel ↔ / ↕ / □)
  └─ weave.item.update({ textAutoResize: mode })
      └─ item.attrs patch
          └─ SelectionViewModel re-evaluates handle dirs IIFE
              ├─ WIDTH_AND_HEIGHT → []
              ├─ HEIGHT           → [e, w]
              └─ NONE              → [e, w, n, s, ne, nw, se, sw]
          └─ TextBlock ResizeObserver: NONE → no-op (Fixed locks height)
```

### Packages touched

- **agocraft/core** — schema/builtin-kinds, command/patch, change/change, model/document, serialize/serializer, 11 error files
- **agocraft/editor** — history, transaction-runner
- **agocraft/sync** — ydoc-bridge
- **weave/apps/web** — types, seed, commands, agocraft-mirror, domains/{TextBlock, LexicalTextEditor}, pages/FrameStage, toolbar/sections/text-section, package.json (Lexical deps + vendor refs)

---

## 3. APIs / data model

### TextAttrs v1 schema (`@agocraft/core/schema/builtin-kinds`)

```typescript
interface TextAttrs {
  // Position
  frame: ItemFrame;

  // Phase 0 (preserved): text + 13 visual fields
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  color: string;
  background?: string;
  textAlign: "left" | "center" | "right" | "justify";
  lineHeight: number;
  letterSpacing: number;
  opacity: number;
  shadow: ShadowSpec | null;
  rotation?: number;

  // Phase 1 (WI-029, all optional, additive):
  textAutoResize?: "WIDTH_AND_HEIGHT" | "HEIGHT" | "NONE";
  textTruncation?: "DISABLED" | "ENDING";
  maxLines?: number | null;
  textRuns?: readonly TextRun[];
  characterStyleOverrides?: readonly number[];
  styleOverrideTable?: Readonly<Record<string, PartialTextStyle>>;
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS";
  paragraphSpacing?: number;
  paragraphIndent?: number;
  hyperlink?: { url: string } | null;
}
```

### Patch variants used (subset of 9 total)

```typescript
type Patch =
  // Phase 0
  | { type: "item.attrs"; itemId; before; after }
  | { type: "item.children"; itemId; added; removed; reordered? }
  | { type: "item.units"; itemId; added; removed }
  | { type: "unit.attrs"; itemId; unitId; unitKind; path; before; after }
  // HANDOFF-007
  | { type: "document.attrs"; before; after }
  | { type: "item.children.reorder"; itemId; before; after }
  | { type: "relations.add"; relation }
  | { type: "relations.remove"; relation }
  // WI-016 Phase 2 (text-specific, collaborative)
  | { type: "item.text"; itemId; ops: DeltaOp[]; inverseOps: DeltaOp[] };
```

### Commands surface (weave)

| Command | Patch emitted | Status |
|---|---|---|
| `weave.item.update` (generic) | `item.attrs` | Existing, used by 9 PropertiesPanel controls + Mode toggle |
| `weave.design.setBackground` | `document.attrs` | ✅ Defined (scaffold), wire-through pending |
| `weave.design.setPresentationOrder` | `document.attrs` | ✅ Defined (scaffold), wire-through pending |
| `weave.design.reorderChildren` | `item.children.reorder` (perm validation) | ✅ Defined (scaffold), wire-through pending |
| `weave.text.applyRange` | `item.text` (Quill Delta retain+attributes) | ⏳ Pending (rich text uses item.attrs patch for now) |
| `weave.item.addBehavior` | `item.units` (+ pending-creations channel) | ⏳ Pending (use-design.ts legacy) |
| `weave.item.removeBehavior` | `item.units` | ⏳ Pending (use-design.ts legacy) |

### Public-interface contract

Per CLAUDE.md "Every public interface must provide typed schemas, stable error codes, permission model, side-effect documentation, contract tests, and reference docs":

- **Typed schemas**: TextAttrs v1 + DeltaOp + PartialTextStyle + TextRun all exported as `readonly` interfaces (no any).
- **Stable error codes**: 11 Error classes × 19 codes, `*_ERROR_CODES` const arrays, type derived via `(typeof X)[number]`. Reference: `agocraft/docs/ERROR_CODES.md`.
- **Permission model**: weave is single-tenant per-room currently (host CLAUDE.md "Security model — globally shared anonymous workspace"). Text mutations carry no auth beyond room access.
- **Side effects**: documented inline in `LexicalTextEditor.tsx`, `TextBlock.tsx`, `ydoc-bridge.ts`. ResizeObserver lifecycle, OnChange noise filter, peek-without-lazy-create.
- **Contract tests**: agocraft (346 + 11 + 10 + 2 + 4 = 373 specs), weave (69). Round-trip + invert + concurrent + seed-idempotency all covered.
- **Reference docs**: `docs/product/TEXT_ITEM_SPEC.md` (host) + `agocraft/docs/ERROR_CODES.md` + inline JSDoc per file.

---

## 4. SOLID + GRASP review

Per `.claude/skills/solid-grasp-review/SKILL.md` — mandatory upstream gate. Each architectural surface introduced is assessed.

### Surfaces introduced

A. **TextAttrs v1 schema extension** (agocraft/core, additive)
B. **`item.text` Patch variant** (agocraft/core/sync)
C. **Y.XmlText bridge in @agocraft/sync** (F2 = root XmlText per-textbox)
D. **HANDOFF-007 4 Patch variants** (document.attrs / item.children.reorder / relations.add/remove)
E. **LexicalTextEditor component** (weave/apps/web)
F. **TextBlock edit/read split** (weave/apps/web)
G. **3-mode resize handle adapter** (weave FrameStage, mode-gated IIFE)
H. **3 design-level commands scaffold** (weave/apps/web/document/commands)

### SOLID (per surface)

| Surface | S | O | L | I | D |
|---|---|---|---|---|---|
| A TextAttrs v1 | ✅ each field is one concern (resize / overflow / typography / paragraph / box) | ✅ additive — existing readers unchanged | ✅ Phase 0 readers still valid (fields optional) | ✅ split between root style + paragraph block + box; PartialTextStyle excludes paragraph fields | ✅ host imports interface from `@agocraft/core` only, no concrete dep |
| B `item.text` Patch | ✅ one variant per mutation kind | ✅ added to discriminated union without changing existing case logic | ✅ patchItemId now returns `\| undefined` — relation-engine updated to skip | ✅ DeltaOp surface separate from PartialTextStyle | ✅ low-level Patch type, high-level commands depend on it |
| C Y.XmlText bridge | ✅ ydoc-bridge owns Y.Doc ↔ Document mapping only | ⚠️ switch on patch.type in applyPatchToYDoc — acceptable per Rule 6 (data-type discriminant, not domain dispatch) | ✅ Y.XmlText is a Y.AbstractType — substitutable in `share.get` peek | ✅ seedTextRuns/decodeItem narrow per-kind helpers | ✅ no concrete UI / host dep — pure data plumbing |
| D HANDOFF-007 variants | ✅ each variant one mutation kind | ✅ Patch union grows without re-coding existing cases | ✅ invertPatch / changeToPatch / patchToChange all exhaustive | ✅ Relation snapshot self-contained (no external lookup for invert) | ✅ relations.* depend on Relation interface only |
| E LexicalTextEditor | ✅ one concern: text editing + snapshot extraction | ✅ Lexical's plugin model — extensible without modifying LexicalTextEditor | ✅ implements common React component contract (props in / events out) | ✅ minimal props (value, onChange, editable, anchorId, initialTextRuns?) | ✅ depends on `@lexical/react` abstract — concrete TextNode access goes through Lexical's $-functions |
| F TextBlock edit/read split | ✅ TextBlock owns container styling + mode arbitration; LexicalTextEditor owns editing | ✅ adding rich attributes (e.g. textCase) extends `renderReadOnly` without breaking edit path | ✅ edit and read both produce same visual for static attrs | ✅ TextBlock props (item, onUpdate?) — no leak | ✅ no agocraft-internal type imports beyond TextAttrs |
| G Mode-gated handle adapter | ✅ handle dirs are a function of textAutoResize alone | ⚠️ switch on textAutoResize value — IIFE pure helper (Rule 6 minimum viable; full registry is overkill for 3-element enum) | ✅ FrameDefaultViewModel.resizeDirs is `ReadonlyArray<ResizeDir>` — any subset substitutable | ✅ resizeDirs prop is well-segregated from other VM concerns | ✅ depends on agocraft TextAttrs.textAutoResize string union only |
| H Design-level commands | ✅ one command = one design-level mutation | ✅ each command produces a single patch type; new commands extend the list without changing existing | ✅ commands implement Command interface | ✅ inputs are tight discriminated types | ✅ depend on Patch + Document abstractions |

### GRASP (subset that applies per surface)

| Surface | Patterns applied |
|---|---|
| A TextAttrs v1 | **Information Expert**: TextAttrs owns its own defaults (`defaultTextAttrs`). **High Cohesion**: all text-specific state in one type. **Protected Variations**: optional fields shield Phase 0 callers. |
| B `item.text` Patch | **Information Expert**: producer computes `inverseOps` at emit-time (no external lookup). **Polymorphism**: Patch union dispatch via switch handled at apply / invert layers — registry-like. **Indirection**: DeltaOp standardizes Lexical ↔ Y.XmlText format. |
| C Y.XmlText bridge | **Pure Fabrication**: `getYTextForItem` is a lookup helper that mediates between item-id and Y.XmlText name. **Protected Variations**: F2 (root XmlText per-textbox) absorbs Lexical's single-editor-per-Y.Doc constraint behind a stable interface. **Information Expert**: seedTextRuns owns "how do I seed a Y.XmlText from TextAttrs". |
| D HANDOFF-007 variants | **Polymorphism**: extension via union variant. **Indirection**: Patch is the mediator between commands and applyChangeToDocument. **Protected Variations**: relations.* carries full Relation snapshot so invert is offline. |
| E LexicalTextEditor | **Pure Fabrication**: `readSnapshot` helper translates Lexical state to weave/agocraft shape. **Indirection**: OnChangePlugin is the boundary between Lexical's reactive state and weave's Patch-emitting state. **Protected Variations**: Lexical bitmask (FORMAT_BOLD=1, etc.) hidden behind formatToAttributes helper. |
| F TextBlock edit/read | **Information Expert**: TextBlock owns container layout + mode-aware styling. **Controller**: TextBlock routes onUpdate calls upstream. **High Cohesion**: read-mode renderer co-located with edit-mode wrapper (one file, one concern: text rendering). |
| G Mode-gated handle adapter | **Polymorphism**: handle dirs derived from mode (table-driven). **Information Expert**: SelectionViewModel owns the mapping (closest to the data — textAutoResize lives on the same item). **Indirection**: IIFE wraps the discriminant, keeps FrameStage above it abstract. |
| H Design-level commands | **Controller**: each command is a single-purpose handler. **Creator**: each command creates its own Patch from ctx + input. **Low Coupling**: depend only on Patch + Document + Command. |

### Boundaries map

```
Patch (agocraft/core)        ──── data-shape boundary ────  weave commands.ts (emit)
                                                            agocraft-mirror.ts (apply)
                                                            history.ts (invert)
                                                            transaction-runner.ts (→ Change)

Y.XmlText (Yjs)              ──── lib boundary ────────  ydoc-bridge.ts (apply/derive/seed)
                                                            never visible to TextBlock/LexicalTextEditor

Lexical EditorState          ──── lib boundary ────────  LexicalTextEditor.tsx (read via $-functions)
                                                            never visible to TextBlock

TextAttrs                    ──── schema boundary ────  weave/types (re-export only)
                                                            seed.ts (literal default)
                                                            text-section.tsx (atomic dispatch)
                                                            TextBlock.tsx (read for render)
```

### Anti-patterns avoided

- **`switch (item.kind)` business logic**: All kind dispatch routed through registries (DOMAIN_RENDERERS, SelectionChromeRegistry). The IIFE on `textAutoResize` in FrameStage is a data-shape lookup, not a domain branch — it's a pure helper for a 3-element enum.
- **Per-host gesture handler duplication**: Lexical's native shortcut handling (Cmd+B/I/U) is reused — weave does not re-implement.
- **Mock fields on items**: `__origFontSize` / `__designWidth` attached during drag are localized to FrameStage's frame manipulation — not leaked into TextAttrs schema.
- **Lexical state as authoritative**: weave persists `text` + `textRuns` into agocraft attrs on every change. Lexical is presentation; weave's Document is canonical.
- **Coupling text rendering to Lexical**: read-mode renders pure HTML/CSS (no Lexical). Lexical is only mounted in edit mode.

### Cross-references

- `design-system-triage` triggered by PropertiesPanel control additions (9 new uses of existing primitives — no new component, no DR-design needed)
- `library-adoption-supply-chain-governance-agent` triggered by Lexical addition (DR-015 records consultation)
- `frontend-performance-agent` triggered by bundle increase (+55.93 KB gz, ≤ FR-002 80 KB criterion)
- `standards-runtime-platform-intelligence-agent` triggered by `-webkit-line-clamp` + `document.fonts.ready` + Y.XmlText reliance

---

## 5. Specialist reviews triggered

| Agent | Surface | Status |
|---|---|---|
| `library-adoption-supply-chain-governance-agent` | Lexical / @lexical/react / @lexical/selection deps | **pending** (DR-015 §Specialist consultation) — license = MIT confirmed; bus factor = Meta (single vendor) accepted via 6mo audit; tree-shake 3-gate PASS BEST tier |
| `frontend-performance-agent` / `rendering-performance-architecture-agent` | bundle (+55.93 KB gz), Lexical reconcile cost, ResizeObserver paint cost | **pending** (FR-002 §8) — 100 frame × 50 char INP < 200ms 50% measurement needed |
| `standards-runtime-platform-intelligence-agent` | `-webkit-line-clamp` Baseline, `document.fonts.ready`, `OffscreenCanvas`, Y.XmlText IME composition Baseline | **pending** (FR-002 §8) — all targets are Baseline Widely Available |
| `privacy-data-protection-agent` | v6→v7 migration, text content as user data | **pending** (RISK-001 condition #4) — round-trip vitest + v6 backup required before launch |
| `ethics-brand-trust-agent` | Concurrent format LWW disclosure, corner-resize change communication | **pending** (RISK-001 conditions #6, #9) — launch note + tooltip + onboarding hint |
| `sre-reliability-agent` | Migration telemetry, Korean IME locale failure rate | **pending** (RISK-001 condition #4 telemetry) — sentry/datadog tag `locale=ko-KR`, event=text-input-anomaly |
| `design-system-agent` | PropertiesPanel 9 controls (all reuse existing primitives — no new component) | **no DR-design required** — existing SegmentedControl / NumberSlider / ColorPicker / DropdownMenu / Button reused |
| `ai-safety-agent` | N/A | v1 has no AI |
| `payment-refund-policy-agent` | N/A | text is not billable surface |

---

## 6. Test plan

### Unit (current state)

| Package | Specs | Notes |
|---|---|---|
| agocraft/core | 350 | 14 Phase 1 + 11 HANDOFF-008 + 7 HANDOFF-007 patch + 3 HANDOFF-007 serializer + 4 Phase 2 patch (item.text) + 311 pre-existing |
| agocraft/editor | 141 | 2 Phase 2 invert + 139 pre-existing |
| agocraft/sync | 21 | 10 Phase 2 text-bridge (round-trip + idempotency + concurrent + DeltaOp type) + 11 pre-existing |
| weave/apps/web | 69 | All pre-existing — no text-specific weave-side unit specs yet (TODO §7) |

### Integration

Currently covered by agocraft's round-trip + serializer + sync tests. Cross-package contract validated by typecheck (18 packages) + build (18 packages).

### e2e (TODO — gap for launch)

**Required new specs** (per `docs/product/TEXT_ITEM_SPEC.md` §7):

1. Mode toggle: Auto-H → Auto-W width shrinks to content
2. Mode toggle: Auto-H → Fixed locks current box + 8 handles
3. Mode toggle: Fixed → Auto-H height becomes responsive
4. Overflow visible: Fixed + truncation=DISABLED + long text spills
5. Truncate ENDING: Fixed + truncation=ENDING + maxLines=3 + 5-line text → 3 lines + `…`
6. Vertical align: V-Align=CENTER positions text mid-box
7. Decoration: text selected → Underline applied → DOM has `<u>` or text-decoration
8. Range style: select word → Cmd+B → only that word bolded → attrs.textRuns reflects
9. Undo range style: applyRange then Cmd+Z → bold removed → textRuns updated
10. Hyperlink: present mode click on linked text → navigates new tab
11. Corner resize does NOT scale fontSize (regression check on DR-016)
12. Korean IME 100 char + 4-browser (CDP partial automation, manual full)

**Rewriting**:
- Existing "Corner resize scales fontSize proportionally" → **reverse** to "Corner resize keeps fontSize unchanged"
- Existing "Edge resize doesn't scale fontSize" → keep, refresh assertions

### Security-negative (current scope)

- Hyperlink URL validation: invalid URL string → input prevents commit OR sanitizes (currently raw; v2 will add validation)
- Text content XSS: read-mode renders text as React children (auto-escaped) + textRuns runs each go through `{insert}` text node — no `dangerouslySetInnerHTML`
- Lexical paste: Lexical sanitizes pasted HTML by default — confirms via paste-test e2e

---

## 7. Rollout, rollback, and remaining 5% phases

### Phase R0 — Current state (merged 2026-05-25)

Single-session triple-step merged: PropertiesPanel + design-level commands scaffold + Rich text per-range. v1 launch foundation ≈ 95%.

### Phase R1 — use-design.ts wire-through + Phase 1.5 migration

**ETA**: 1.5–2 dev-days
**Owner**: hbpark
**Scope**:
- Migrate `design.background` + `design.presentationOrder` → `document.attrs.background` + `document.attrs.presentationOrder`
- Update all readers (storage.ts, render path, etc.) to read from doc.attrs
- `use-design.ts` callbacks (setDesignBackground / setPresentationOrder / reorderRootChildrenCb) call `editor.exec("weave.design.X", ...)`
- Phase 1.5 schema rename: `textAlign → textAlignHorizontal`, `lineHeight: number → LineHeightSpec`, `text → textRuns` canonical
- v6 → v7 serializer migration (per HANDOFF-010 §E)

**Dependency**: agocraft Phase 1.5 (already supported by serializer.ts with `onUnknown:"preserve"`).

**Risk**: cross-cutting — every reader site. mitigation: comprehensive grep + typecheck gate.

### Phase R2 — addBehavior / removeBehavior commands

**ETA**: 1 dev-day
**Owner**: hbpark
**Scope**:
- `weave.item.addBehavior` command: emit `item.units` patch + populate Unit body via pending-creations side-channel (per agocraft seed conventions)
- `weave.item.removeBehavior` command: emit `item.units` patch with removed unitId
- `use-design.ts` `addBehavior` callback → editor.exec
- weave's hotspot create UI rewires through editor.exec

### Phase R3 — Bundle lazy-load

**ETA**: 0.5 dev-day
**Owner**: hbpark
**Scope**:
- Convert `LexicalTextEditor` import to dynamic via `React.lazy` + `Suspense`
- Loaded only when user enters edit mode (double-click or `clickToEdit`)
- Verify initial bundle drops back to ~270 KB gz, Lexical chunk ≈ 55 KB lazy

### Phase R4 — e2e (new 10 + 2 rewrite)

**ETA**: 1.5–2 dev-days
**Owner**: hbpark
**Scope**: see §6 e2e list

### Phase R5 — Launch note + tooltip + onboarding hint

**ETA**: 0.5 dev-day
**Owner**: hbpark / product
**Scope**:
- launch note (in-app banner, 1 week) explaining corner-resize paradigm change
- tooltip near fontSize slider ("글자 크기는 여기서 변경 — 코너 드래그는 박스만")
- 1-step onboarding hint on first text-item creation
- support article in `docs/help`

### Rollback strategy

- **Feature flag**: `WEAVE_TEXT_V1` could gate the new PropertiesPanel + LexicalTextEditor, but **not implemented** (entirely additive — old text items render via fallbacks). Rollback = revert weave PR; agocraft vendor stays (Phase 1 is additive).
- **agocraft vendor revert**: file:tgz can be swapped back to `1.0.0-rc.20260525044428` (pre-WI-029) — restore weave's old package.json refs. Phase 1 fields become unused, no breakage.
- **Migration v6→v7 rollback**: not yet shipped; v7 backup preserved per RISK-001 condition #4. Reading v7 docs as v6 = fields ignored (additive). Reading v6 docs as v7 = backward-compat defaults applied. No destructive migration in R0.

### Kill switch

- Lexical-side issue: revert `TextBlock` to use legacy `EditableText` (one-line import change). Lexical deps stay in package.json.
- ResizeObserver runaway: `autoResizeRef.current === "NONE"` early return is the existing kill (set all text items to Fixed via global migration to halt observer side-effects).

---

## 8. Migration plan

| From | To | Step | Reversibility |
|---|---|---|---|
| Phase 0 TextAttrs (13 fields) | Phase 1 TextAttrs (24 fields, 11 optional) | Auto (additive — defaults applied on read) | full (Phase 0 reader ignores Phase 1 fields) |
| `design.background` (wrapper) | `document.attrs.background` (doc) | Phase R1: migrate field + update readers | manual (wrapper → doc shift; needs v6→v7 stamping) |
| `design.presentationOrder` (wrapper) | `document.attrs.presentationOrder` (doc) | Same as above | Same |
| `text: string` (canonical) | `textRuns: TextRun[]` (canonical), `text` derived | Phase R1: migrate field + serialize v6→v7 + getPlainText helper | one-way (no destructive rewrite; legacy readers fall back via getPlainText) |
| `textAlign: "left"` | `textAlignHorizontal: "LEFT"` (UPPERCASE) | Phase R1: rename + uppercase + serialize migration | one-way (legacy readers see textAlignHorizontal as new field, fall back to default — minor UX regression for legacy clients) |
| `lineHeight: number` (multiplier) | `lineHeight: LineHeightSpec` | Phase R1: same | one-way (interpret number form via getLineHeight helper for legacy readers) |
| Y.XmlText absent (SYNC_ENABLED=false) | Y.XmlText present (per-textbox) | Auto when first item.text patch emitted; seedTextRuns idempotent | full (no Y.XmlText = revert to attrs.text/textRuns reading) |

### Pre-migration

- v6 backup: localStorage / KV `__backup_v6__:` namespace populated on first v7 forward
- Round-trip vitest with 100+ fixture (per RISK-001 condition #4)

### Post-migration

- Migration telemetry: `migration.attempt / success / failure / rollback` counters monitored 1 month after launch
- Failure rate > 0.1% = incident (RISK-001 condition #4)

---

## 9. Conditions and follow-ups

Per RISK-001, these conditions must be closed before launch-gate-review:

- [x] **Condition #1**: Lexical PoC PASS — **cleared 2026-05-25**
- [ ] **Condition #2**: Slate fallback IME gate — **unreachable** (Plan A succeeded)
- [ ] **Condition #3**: Mixed badge UX for concurrent format LWW (Phase 2 collaborative; gated by SYNC_ENABLED)
- [ ] **Condition #4**: Migration round-trip vitest + v6 backup + telemetry (Phase R1)
- [ ] **Condition #5**: StrictMode mount/unmount/remount e2e (Phase R4)
- [ ] **Condition #6**: Launch note + tooltip + onboarding hint (Phase R5)
- [ ] **Condition #7**: Bundle-size budget enforcement ≤ 80 KB gz (revised from ≤ 60 KB per FR-002 update; bundle Lexical chunk currently ≈ 55 KB lazy-loadable in Phase R3)
- [ ] **Condition #8**: 3 specialist sign-offs (library-adoption / frontend-perf / standards-runtime) — pending
- [ ] **Condition #9**: LWW disclosure (Phase R5)
- [x] **Condition #10**: HANDOFF-010 check-in — Closed (all dependencies resolved)

---

## 10. Links

- Triggering Work Item: [WI-029](../../records/work-items/WI-029-text-item-figma-equivalent.md)
- Product spec: [TEXT_ITEM_SPEC.md](../../docs/product/TEXT_ITEM_SPEC.md)
- Feasibility: [FR-002](../../records/feasibility-reviews/FR-002-text-item-figma-equivalent.md)
- Risk: [RISK-001](../../records/risks/RISK-001-text-item-v1.md)
- Decisions: [DR-015](../../records/decisions/DR-015-rich-text-editor-pick.md) (Accepted), [DR-016](../../records/decisions/DR-016-text-resize-paradigm.md) (Accepted)
- Cross-project: agocraft `records/work-items/WI-016` (Done), `HANDOFF-007` (Closed), `HANDOFF-008` (Closed)
- PoC: [`experiments/lexical-text-poc/RESULT.md`](../../experiments/lexical-text-poc/RESULT.md) — verdict PASS
- Skills referenced: `.claude/skills/engineering-plan/SKILL.md`, `.claude/skills/solid-grasp-review/SKILL.md`, `.claude/skills/technical-feasibility-review/SKILL.md`, `.claude/skills/risk-governance-review/SKILL.md`

## 11. Status updates

- 2026-05-25: Plan drafted after single-session triple-step merge. Foundation 95% complete; Phase R1–R5 scoped. SOLID + GRASP review embedded for 8 architectural surfaces. 3 specialist reviews pending.
