// Offline-edit reconcile prompt (2026-05-29).
//
// Shown when opening a design whose localStorage holds an UNSYNCED OFFLINE
// EDIT (see the persistence model in `storage.ts` + `useDesign`'s
// `localConflict`). The user must choose what to do with that local copy
// before continuing — so this dialog blocks Esc / outside-click dismissal
// and exposes no close affordance; the only exits are the two actions.
//
// Design-system triage:
//   - Step 1 Reused: Dialog / DialogContent / DialogHeader / DialogFooter /
//     Button. No new primitive, token, or theme.
//   - Steps 2–5 / public-surface: not triggered (in-app editor modal) — no
//     DR-design entry required.

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader } from "@weave/design-system";

export interface LocalDesignConflictDialogProps {
  /** Controlled open state — mirror `useDesign().localConflict`. */
  readonly open: boolean;
  /** "새 디자인으로 저장": save the offline copy to the server as a new
   *  design (the original server design is left untouched). */
  readonly onSave: () => void;
  /** "버리기": discard the offline copy and load the server version. */
  readonly onDiscard: () => void;
  /** Disables both actions while a resolution round-trip is in flight. */
  readonly busy?: boolean;
}

export function LocalDesignConflictDialog({
  open,
  onSave,
  onDiscard,
  busy = false,
}: LocalDesignConflictDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        size="sm"
        tone="panel"
        data-testid="local-conflict-dialog"
        // The user MUST pick an action — there's no coherent "dismiss"
        // state for an unresolved offline edit, so block the implicit exits.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader
          headline="저장되지 않은 로컬 변경사항"
          description="이 디자인에 서버에 반영되지 않은 오프라인 저장본이 있습니다. 저장하면 기존 디자인은 그대로 두고 새 디자인으로 저장됩니다."
        />
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onDiscard}
            data-testid="local-conflict-discard"
          >
            버리기
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={onSave}
            data-testid="local-conflict-save"
          >
            새 디자인으로 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
