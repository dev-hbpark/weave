# Engineering Plan — Design selection export / import — WI-089

| Field | Value |
|---|---|
| Feature | `export-import` (selection-only file transport over the clipboard payload) |
| Owner | hbpark |
| Status | **Done** (2026-06-04 — implemented + verified) |
| Triggering WI | WI-089 |
| Decisions | DR-051 (Accepted 2026-06-04) |
| Reuses | WI-041 clipboard (`weave/items.v1` payload, `weave.clipboard.paste`), DR-025 clipboard kit, WI-072 paste container resolution |
| Last updated | 2026-06-04 |

---

## 1. Scope and risks

### Scope (in)

- Export the **current selection** to a downloadable `<slug>-selection.json`.
- Import such a file into any design — items land via the existing paste
  pipeline (new ids, single Cmd+Z, paste-into-frame, node cap).
- Forward-safe file envelope (`fileVersion`) + structural validation of
  untrusted file input with stable error codes.

### Scope (out / deferred)

- Whole-document export (cloud save already covers full-doc persistence).
- Asset-bundle (`.zip`) export — images stay as resource refs; a bundle that
  inlines bytes is a separate WI.
- Relation cloning — exported as `[]`, shared deferral with the clipboard
  (DR-019 D3).

### Risks

- **Untrusted file input.** Mitigated: `parseExportFile` validates the magic
  marker, file version, payload schema/kind, and every item's shape before
  paste. Unknown *item kinds* are preserved (paste's `onUnknown: "preserve"`),
  not executed — there is no code in a file, only data.
- **Clobbering the live clipboard on import.** Mitigated: the hook stashes
  `clipboardStore.peek()`, writes the imported payload, pastes synchronously,
  then restores the previous entry.
- **Oversized paste.** Mitigated: export enforces the same `MAX_PASTE_NODES`
  cap as copy, so a produced file can always be re-imported.

## 2. Design

Two pure halves + one host hook + UI:

- `export-import.ts` — `WeaveExportFileV1` envelope, `buildExportFile`,
  `serializeExportFile`, `parseExportFile`. No DOM / editor / I/O.
- `use-export-import.ts` — `exportSelection()` (Blob download) and
  `importFile(file)` (read → validate → write to `clipboardStore` → reuse
  `weave.clipboard.paste` with the host's container resolvers → restore
  clipboard).
- `DesignPage.tsx` — paste resolvers (container id / size / pointer) extracted
  once and shared by both the clipboard hook and the import hook so a Cmd+V and
  an import land identically; hidden file input; auto-clearing `Banner` feedback.
- `DesignHeader.tsx` — File menu (`IconMore`): export (disabled w/o selection) +
  import.

No new serializer, no new paste command, no `switch`/`case` on kind (Rule 6).

## 3. Verification (Continuous Self-Verification gate)

- `pnpm typecheck` clean.
- `pnpm test` — 515/515, including 12 new unit tests in `export-import.test.ts`
  (round-trip, selection order, drift-skip, empty/no-resolve, cap, and every
  parse rejection code).
- `biome check` clean on new files; Rule 6 / declarative-dispatch clean.
- e2e (`apps/web/e2e/export-import.spec.ts`) 2/2 against the live runtime:
  export via the File menu → import the downloaded bytes → a fresh child
  appears → one Cmd+Z reverts it; and a non-weave JSON is rejected with the
  feedback banner and no doc mutation.
- Regression: `clipboard-items` + `clipboard-paste-special` 7/7 (the shared
  resolver extraction did not change paste behavior).
