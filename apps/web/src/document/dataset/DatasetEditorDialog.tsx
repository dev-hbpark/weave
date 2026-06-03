// WI-077 — DatasetEditorDialog: the "데이터 관리 아이템" editing surface.
//
// A modal editor for the dataset a chart references. The table itself is a
// lazy-loaded react-data-grid (DatasetGrid) — spreadsheet-like editing with
// keyboard nav, drag-fill, and Excel/Sheets block paste (DR-034) — kept out of
// the main bundle (loaded on demand, like the echarts renderer). This shell
// owns the dataset name + add row/column + the Suspense boundary; every change
// commits via `weave.dataset.update` (one undoable transaction). Because the
// dataset is shared, edits reflow EVERY chart pointing at this id (DR-031).

import type { Editor } from "@agocraft/editor";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  IconPlus,
} from "@weave/design-system";
import { type JSX, lazy, Suspense } from "react";
import { useResolveDataset } from "./dataset-context.js";
import { addColumn, addRow, type DatasetPayload } from "./dataset-store.js";

// react-data-grid + its CSS are code-split into this lazy chunk.
const DatasetGrid = lazy(() => import("./DatasetGrid.js"));

export interface DatasetEditorDialogProps {
  readonly editor: Editor;
  readonly datasetId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function DatasetEditorDialog({
  editor,
  datasetId,
  open,
  onOpenChange,
}: DatasetEditorDialogProps): JSX.Element {
  const resolve = useResolveDataset();
  const payload = datasetId === "" ? undefined : resolve(datasetId);

  const update = (patch: (p: DatasetPayload) => DatasetPayload): void => {
    editor.exec("weave.dataset.update", { id: datasetId, patch });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent tone="overlay" size="lg" data-testid="dataset-editor" aria-label="데이터 편집">
        <DialogHeader compact headline="데이터 편집" />
        {payload === undefined ? (
          <p className="text-[13px] text-[color:var(--text-soft)] py-4">
            데이터셋을 찾을 수 없습니다.
          </p>
        ) : (
          <>
            <div className="mb-3">
              <input
                key={`name:${payload.name}`}
                defaultValue={payload.name}
                aria-label="데이터셋 이름"
                data-testid="dataset-name"
                onBlur={(e) => {
                  const name = e.currentTarget.value;
                  if (name !== payload.name) update((p) => ({ ...p, name }));
                }}
                className="h-9 px-3 w-full rounded-[var(--radius-md)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[14px] text-[color:var(--text-strong)]"
              />
            </div>

            <p className="mb-2 text-[11.5px] text-[color:var(--text-soft)]">
              엑셀·구글 시트에서 복사한 표를 붙여넣으면 한 번에 채워집니다. 셀 모서리를 끌어 연속
              채우기, Tab·Enter·화살표로 이동할 수 있어요.
            </p>

            <Suspense
              fallback={
                <div
                  data-testid="dataset-grid-loading"
                  className="h-[320px] grid place-items-center rounded-[var(--radius-md)] border border-[color:var(--surface-2-border)] text-[12px] text-[color:var(--text-soft)]"
                >
                  표 편집기 불러오는 중…
                </div>
              }
            >
              <DatasetGrid editor={editor} datasetId={datasetId} payload={payload} />
            </Suspense>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => update(addRow)}
                  data-testid="dataset-row-add"
                >
                  <IconPlus size={14} /> 행 추가
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => update(addColumn)}
                  data-testid="dataset-col-add"
                >
                  <IconPlus size={14} /> 열 추가
                </Button>
              </div>
              <DialogClose asChild>
                <Button variant="primary" size="md" data-testid="dataset-editor-done">
                  완료
                </Button>
              </DialogClose>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
