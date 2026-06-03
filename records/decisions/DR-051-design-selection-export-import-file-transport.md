# DR-051 — Design-selection export / import as a file transport over the clipboard payload

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-089
- **Relates:** DR-019 (clipboard copy/cut/paste design — same `weave/items.v1` payload), WI-041 (clipboard implementation + cross-tab transports), DR-025 (clipboard kit absorbed into `@agocraft/core`), WI-072 (paste-into-frame container resolution)

## Context

Users want to move a selected part of one design into another (or keep a
portable backup of a fragment). The clipboard already serialises a
selection into a `weave/items.v1` `ItemsClipboardPayload` and re-issues it
through `editor.exec("weave.clipboard.paste", ...)` — the same payload
flows through the in-memory store, the BroadcastChannel, and the
localStorage transports (WI-041). What was missing was a **file**
transport: download the payload, upload it elsewhere.

Scope was set with the operator: **selection only** (not the whole
document). That maps exactly onto the existing copy/paste unit of work, so
the cheapest correct design is to bridge a file to that pipeline rather
than build a parallel serializer.

## Decision

Add export / import as a **thin file transport on top of the existing
clipboard payload** — no new serialization model, no new paste path.

1. **File envelope `WeaveExportFileV1`** (`export-import.ts`) wraps the
   unchanged `ItemsClipboardPayload` with a self-describing header:
   `_weave: "weave/design-selection"` magic + `fileVersion: 1` +
   `exportedAt` / `appVersion` / `itemCount`. The inner payload is
   byte-identical to what the clipboard writes, so import can hand it
   straight to paste.
2. **Export** = `buildExportFile(doc, selectedIds, env)` — serialises each
   selected subtree with the shared `serializeItemSubtree`, enforces the
   same `MAX_PASTE_NODES` cap (an export can never produce a file the
   importer would refuse), preserves selection order, and downloads
   `<slug>-selection.json`. It builds the payload directly from the
   document so it does **not** clobber the user's live clipboard.
3. **Import** = `parseExportFile(text)` validates the envelope + payload
   structurally (untrusted input — it came from outside the tab), then the
   hook writes the payload into the **same `clipboardStore` the paste
   command reads from**, invokes `weave.clipboard.paste` with the host's
   live container resolvers, and **restores the user's previous clipboard**
   afterward. This reuses 100% of paste: `remapIds`, single-transaction
   `item.create`, single Cmd+Z, frame projection, the node cap.
4. **UI** — a File menu (`IconMore`) in the header's right (document-scoped)
   group: "선택 영역 내보내기" (disabled with no selection) + "가져오기…"
   (hidden `<input type=file>`). Feedback reuses the design-system `Banner`
   (auto-clearing), not a new toast primitive.

## Alternatives considered

- **Whole-document export.** Rejected for v1 — out of the operator's scope;
  the document already round-trips through cloud save. Selection export is
  the portable-fragment need.
- **A standalone file serializer independent of the clipboard.** Rejected —
  it would duplicate `serializeItemSubtree` + the remap/stage/paste assembly
  and immediately drift from the clipboard's cross-version contract.
- **A new `paste-from-file` command.** Rejected — paste already reads from a
  transport abstraction; writing the payload into the store and reusing the
  verb is less surface and inherits every paste guarantee for free.

## Consequences

- Files are forward-incompatible-safe: a `fileVersion` from a newer build is
  refused with `unsupported-file-version`; an unknown inner `schemaVersion` /
  `kind` with `unsupported-payload`; arbitrary JSON with `not-a-weave-file`.
- Unknown **item kinds** inside a valid file are preserved, not rejected —
  paste's downstream `deserialize` runs `onUnknown: "preserve"`, matching the
  clipboard's cross-version policy.
- Relations are exported as `[]` (DR-019 D3's deferred follow-up); the file
  inherits that contract, so relation cloning lands in the same future PR for
  both transports.
- Import overwrites then restores the in-memory clipboard within one
  synchronous `exec`, so the user's copy survives an import.

## Scope (edits)

- `apps/web/src/document/export-import/export-import.ts` — new: envelope +
  `buildExportFile` / `serializeExportFile` / `parseExportFile` (pure).
- `apps/web/src/document/export-import/use-export-import.ts` — new: download +
  import-paste hook reusing `clipboardStore` + `weave.clipboard.paste`.
- `apps/web/src/document/export-import/export-import.test.ts` — new: 12 unit
  tests (round-trip, order, cap, all rejection codes).
- `apps/web/src/pages/DesignPage.tsx` — extract shared paste resolvers
  (reused by clipboard + import), mount the hook, hidden file input,
  feedback Banner.
- `apps/web/src/pages/design/view/DesignHeader.tsx` — File menu (export /
  import) + props.
- `apps/web/e2e/export-import.spec.ts` — new: export→import round-trip with
  single-Cmd+Z revert, and bad-file rejection.

## Verification

- `pnpm typecheck` clean; `pnpm test` 515/515 (12 new); `biome check` clean on
  new files; Rule 6 (no `switch`/`case` on kind) clean.
- e2e: `export-import.spec.ts` 2/2; `clipboard-items` + `clipboard-paste-special`
  7/7 (no regression from the resolver extraction).
