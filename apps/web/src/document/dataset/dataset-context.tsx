// WI-077 Phase 2 / WI-078 — DatasetContext (DR-031 / DR-035).
//
// Domain renderers (mounted by agocraft's FrameSurface) receive only
// `{ item, onUpdate }` — they have no handle on the document. A `chart` item,
// however, must (a) RESOLVE its referenced dataset (root-unit store) and
// (b) COMMIT category-label edits back to it (WI-078 — labels are double-click
// inline-editable, edits route to the dataset). This context bridges both: the
// page holding the live doc + editor (DesignPage) wraps the tree in
// `DatasetProvider`, and `ChartBlock` reads `useResolveDataset()` /
// `useDatasetCommit()`.
//
// Outside a provider (tests, read-only PresentPage) the resolver returns
// undefined and the committer is a no-op — no crash, no hard dependency on the
// document/editor leaking into the renderer.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type DatasetPayload, resolveDataset, setCell } from "./dataset-store.js";

/** Resolve a dataset payload by id. Returns undefined for a dangling/empty id
 *  or when no provider is mounted. */
export type DatasetResolver = (id: string) => DatasetPayload | undefined;

/** Commit a single cell edit back to a dataset (one undoable transaction). */
export type DatasetCommit = (
  datasetId: string,
  rowIndex: number,
  column: string,
  text: string,
) => void;

const NULL_RESOLVER: DatasetResolver = () => undefined;
const NULL_COMMIT: DatasetCommit = () => undefined;

const DatasetResolverContext = createContext<DatasetResolver>(NULL_RESOLVER);
const DatasetCommitContext = createContext<DatasetCommit>(NULL_COMMIT);

export interface DatasetProviderProps {
  /** The live document whose root-unit store holds the datasets. */
  readonly doc: AgocraftDocument;
  /** Editor for committing edits. Omitted on read-only surfaces (PresentPage)
   *  → the committer is a no-op. */
  readonly editor?: Editor;
  readonly children: ReactNode;
}

/** Publishes `resolveDataset` + `commitCell` bound to `doc`/`editor`. The
 *  resolver is memoized on `doc` identity, so a new immutable snapshot (after
 *  `weave.dataset.update`) yields a fresh resolver and every consuming chart
 *  re-renders with the new data — the reactivity substrate from DR-031 § 4. */
export function DatasetProvider({ doc, editor, children }: DatasetProviderProps) {
  const resolver = useMemo<DatasetResolver>(() => (id: string) => resolveDataset(doc, id), [doc]);
  const commit = useMemo<DatasetCommit>(
    () =>
      editor === undefined
        ? NULL_COMMIT
        : (datasetId, rowIndex, column, text) =>
            editor.exec("weave.dataset.update", {
              id: datasetId,
              patch: (p: DatasetPayload) => setCell(p, rowIndex, column, text),
            }),
    [editor],
  );
  return (
    <DatasetResolverContext.Provider value={resolver}>
      <DatasetCommitContext.Provider value={commit}>{children}</DatasetCommitContext.Provider>
    </DatasetResolverContext.Provider>
  );
}

/** Read the dataset resolver. Safe outside a provider (returns the null
 *  resolver → placeholder rendering). */
export function useResolveDataset(): DatasetResolver {
  return useContext(DatasetResolverContext);
}

/** Read the dataset cell committer. Safe outside a provider (no-op). */
export function useDatasetCommit(): DatasetCommit {
  return useContext(DatasetCommitContext);
}
