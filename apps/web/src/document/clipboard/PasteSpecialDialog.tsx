// WI-041 Phase 6 — Paste Special dialog (DR-019 D6).
//
// Triggered by Cmd+Opt+V (or by the ContextMenu's "선택하여 붙여넣기…"
// row). Lets the user pick one of five paste flavours; on submit, the
// host dispatches `weave.clipboard.paste` with the chosen mode and the
// current selection set.
//
// Design-system triage:
//   - Step 1 Reused: Dialog / DialogContent / DialogHeader /
//     DialogFooter / DialogClose, RadioTileGroup / RadioTile,
//     Button. No new primitives needed.
//   - Step 2 / 3: not triggered — no new tokens, no public-surface
//     impact, no DR-design entry required.

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  RadioTile,
  RadioTileGroup,
} from "@weave/design-system";
import { useState } from "react";
import type { PasteMode } from "./clipboard-types.js";

interface ModeOption {
  readonly value: PasteMode;
  readonly title: string;
  readonly tagline: string;
}

const MODE_OPTIONS: ReadonlyArray<ModeOption> = [
  {
    value: "everything",
    title: "전체",
    tagline: "클립보드의 항목을 그대로 새로 붙여넣습니다.",
  },
  {
    value: "style",
    title: "스타일만",
    tagline: "선택한 항목의 색·테두리·서체 등 시각 스타일만 교체합니다.",
  },
  {
    value: "text",
    title: "텍스트만",
    tagline: "선택한 텍스트 항목의 내용만 교체합니다.",
  },
  {
    value: "size",
    title: "크기만",
    tagline: "선택한 항목의 너비·높이만 교체합니다 (위치는 유지).",
  },
  {
    value: "position",
    title: "위치만",
    tagline: "선택한 항목의 위치(x·y)만 교체합니다 (크기는 유지).",
  },
];

export interface PasteSpecialDialogProps {
  /** Dialog open state — controlled by the host. */
  readonly open: boolean;
  /** Fired on overlay / Esc / Cancel — host closes the dialog. */
  readonly onOpenChange: (next: boolean) => void;
  /** Fired when the user confirms a mode. Host invokes
   *  `weave.clipboard.paste` with the chosen mode + the current
   *  selection. */
  readonly onConfirm: (mode: PasteMode) => void;
  /** Whether the items clipboard currently holds a payload. When false
   *  the dialog disables submit (the user can still close). */
  readonly clipboardHasItems: boolean;
  /** Whether the user currently has at least one Item selected. The
   *  Paste Special modes (style / text / size / position) need a
   *  target; `everything` does not. Disables submit accordingly. */
  readonly hasSelection: boolean;
}

export function PasteSpecialDialog({
  open,
  onOpenChange,
  onConfirm,
  clipboardHasItems,
  hasSelection,
}: PasteSpecialDialogProps) {
  // Local state — defaults to `everything` so the dialog round-trips
  // to "Cmd+V behaviour" if the user just hits Enter.
  const [mode, setMode] = useState<PasteMode>("everything");

  const requiresSelection = mode !== "everything";
  const submitDisabled = !clipboardHasItems || (requiresSelection && !hasSelection);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" tone="panel" data-testid="paste-special-dialog">
        <DialogHeader
          headline="선택하여 붙여넣기"
          description="클립보드의 어떤 부분을 적용할지 선택하세요."
        />
        <RadioTileGroup
          value={mode}
          onValueChange={(next) => setMode(next as PasteMode)}
          cols={2}
          aria-label="Paste mode"
        >
          {MODE_OPTIONS.map((opt) => (
            <RadioTile
              key={opt.value}
              value={opt.value}
              title={opt.title}
              tagline={opt.tagline}
              data-testid={`paste-special-mode-${opt.value}`}
            />
          ))}
        </RadioTileGroup>
        {requiresSelection && !hasSelection ? (
          <p
            className="mt-4 text-[12px] text-[color:var(--text-soft)]"
            data-testid="paste-special-needs-selection"
          >
            이 모드는 적용할 대상 항목을 먼저 선택해야 합니다.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" data-testid="paste-special-cancel">
              취소
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={submitDisabled}
            onClick={() => {
              if (submitDisabled) return;
              onConfirm(mode);
            }}
            data-testid="paste-special-confirm"
          >
            붙여넣기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
