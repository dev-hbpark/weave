import { CommandPalette } from "@weave/design-system";
import type { PasteMode } from "../../../document/clipboard/clipboard-types.js";
import { PasteSpecialDialog } from "../../../document/clipboard/PasteSpecialDialog.js";
import { LocalDesignConflictDialog } from "../../../document/LocalDesignConflictDialog.js";
import { MediaSrcDialog } from "../../../document/toolbar/MediaSrcDialog.js";
import { SlidePresetPicker } from "../../new-design/SlidePresetPicker.js";

// DR-027 / WI-071 Phase 2 — modal/dialog cluster extracted from DesignPageBody.
// Pure presentation: ISP-narrow props. The media-confirm dispatch and the
// slide-preset insert (both editor.exec logic) are lifted to orchestrator
// handlers and passed in as callbacks — no business logic lives here.

export interface DesignDialogsProps {
  // MediaSrcDialog (add / edit / fill media source)
  readonly mediaOpen: boolean;
  readonly mediaKind: "image" | "video";
  readonly mediaInitialSrc: string;
  readonly mediaInitialAlt: string;
  readonly onMediaConfirm: (src: string, alt?: string) => void;
  readonly onMediaCancel: () => void;
  // PasteSpecialDialog (WI-041)
  readonly pasteSpecialOpen: boolean;
  readonly onPasteSpecialOpenChange: (next: boolean) => void;
  readonly onPasteSpecialConfirm: (mode: PasteMode) => void;
  readonly clipboardHasItems: boolean;
  readonly hasSelection: boolean;
  // LocalDesignConflictDialog (offline reconcile)
  readonly conflictOpen: boolean;
  readonly conflictBusy: boolean;
  readonly onConflictSave: () => void;
  readonly onConflictDiscard: () => void;
  // SlidePresetPicker (WI-030)
  readonly slidePickerOpen: boolean;
  readonly onSlidePickerOpenChange: (open: boolean) => void;
  readonly onPickPreset: (presetId: string) => void;
  // CommandPalette (WI-026)
  readonly paletteOpen: boolean;
  readonly onPaletteOpenChange: (open: boolean) => void;
}

export function DesignDialogs({
  mediaOpen,
  mediaKind,
  mediaInitialSrc,
  mediaInitialAlt,
  onMediaConfirm,
  onMediaCancel,
  pasteSpecialOpen,
  onPasteSpecialOpenChange,
  onPasteSpecialConfirm,
  clipboardHasItems,
  hasSelection,
  conflictOpen,
  conflictBusy,
  onConflictSave,
  onConflictDiscard,
  slidePickerOpen,
  onSlidePickerOpenChange,
  onPickPreset,
  paletteOpen,
  onPaletteOpenChange,
}: DesignDialogsProps): React.ReactNode {
  return (
    <>
      <MediaSrcDialog
        open={mediaOpen}
        kind={mediaKind}
        initialSrc={mediaInitialSrc}
        initialAlt={mediaInitialAlt}
        onConfirm={onMediaConfirm}
        onCancel={onMediaCancel}
      />
      {/* WI-041 Phase 6 — Paste Special. Cmd+Opt+V (or ContextMenu) opens it;
          on confirm the host invokes weave.clipboard.paste with the mode. */}
      <PasteSpecialDialog
        open={pasteSpecialOpen}
        onOpenChange={onPasteSpecialOpenChange}
        onConfirm={onPasteSpecialConfirm}
        clipboardHasItems={clipboardHasItems}
        hasSelection={hasSelection}
      />
      {/* Offline-edit reconcile prompt — opens when the design has an unsynced
          offline copy. "저장" uploads it; "버리기" discards + loads server copy. */}
      <LocalDesignConflictDialog
        open={conflictOpen}
        busy={conflictBusy}
        onSave={onConflictSave}
        onDiscard={onConflictDiscard}
      />
      {/* WI-030 — slide preset picker. Picking dispatches a single
          weave.preset.insertSlide (one history entry; Cmd+Z reverts the subtree). */}
      <SlidePresetPicker
        open={slidePickerOpen}
        onOpenChange={onSlidePickerOpenChange}
        onPick={onPickPreset}
      />
      <CommandPalette open={paletteOpen} onOpenChange={onPaletteOpenChange} />
    </>
  );
}
