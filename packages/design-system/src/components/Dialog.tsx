import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.js";

/** Weave-themed wrapper around Radix Dialog. The trigger is exposed
 *  directly via `Dialog.Trigger` (Radix Slot), the content sits inside
 *  `Dialog.Content` with overlay + entrance motion. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogTone = "panel" | "overlay";
export type DialogSize = "sm" | "md" | "lg";

export interface DialogContentProps extends DialogPrimitive.DialogContentProps {
  readonly children: ReactNode;
  /** Surface treatment.
   *  - "panel" (default) — heavy aurora-glass sheet on `--surface-1`. For
   *    settings sheets, confirmation modals, multi-section flows.
   *  - "overlay" — lighter dark-glass on `--surface-overlay`, matching the
   *    surrounding menus (DropdownMenu / Popover). For quick input prompts. */
  readonly tone?: DialogTone;
  /** Width preset. sm = 460, md = 580, lg = 720 (default). */
  readonly size?: DialogSize;
}

const SIZE_MAX: Record<DialogSize, string> = {
  sm: "w-[min(92vw,460px)]",
  md: "w-[min(92vw,580px)]",
  lg: "w-[min(92vw,720px)]",
};

export function DialogContent({
  className,
  children,
  tone = "panel",
  size = "lg",
  ...rest
}: DialogContentProps) {
  const reduced = useReducedMotion();
  const enter = reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };
  const initial = reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 };
  const isOverlay = tone === "overlay";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-40",
          // Overlay tone uses a lighter scrim — the dialog is a quick prompt,
          // not a focused full-attention modal.
          isOverlay
            ? "bg-[color:var(--bg)]/35 backdrop-blur-[6px]"
            : "bg-[color:var(--bg)]/55 backdrop-blur-[10px]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in data-[state=closed]:fade-out",
        )}
      />
      <DialogPrimitive.Content
        {...rest}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          SIZE_MAX[size],
          "max-h-[88vh] overflow-auto",
          isOverlay
            ? [
                "rounded-[var(--radius-md)] bg-[color:var(--surface-overlay)]",
                "border border-[color:var(--surface-overlay-border)]",
                "backdrop-blur-[var(--surface-blur)] shadow-[var(--shadow-overlay)]",
                "p-5",
              ].join(" ")
            : [
                "rounded-[var(--radius-xl)] bg-[color:var(--surface-1)]",
                "border border-[color:var(--surface-1-border)]",
                "backdrop-blur-[var(--surface-blur)] shadow-[var(--shadow-glow)]",
                "p-6 md:p-8",
              ].join(" "),
          "focus-visible:outline-none",
          className,
        )}
        asChild
      >
        <motion.div initial={initial} animate={enter} transition={{ duration: 0.18 }}>
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Convenience header — Title + optional description. Pairs with DialogContent.
 *
 *  `headline` is the visible title (renders inside `DialogPrimitive.Title` for
 *  accessibility). Named `headline` rather than `title` to avoid colliding
 *  with the inherited HTML `title` string attribute on the wrapper div, which
 *  would narrow the ReactNode type to `string`. */
export function DialogHeader({
  headline,
  description,
  compact = false,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly headline: ReactNode;
  readonly description?: ReactNode;
  /** Smaller title (`14px`) for `tone="overlay"` Dialogs that are quick prompts. */
  readonly compact?: boolean;
}) {
  return (
    <div className={cn(compact ? "mb-3" : "mb-5", className)} {...rest}>
      <DialogPrimitive.Title
        className={cn(
          "font-semibold tracking-[-0.01em] text-[color:var(--text-strong)]",
          compact ? "text-[15px]" : "text-[20px] md:text-[22px]",
        )}
      >
        {headline}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description
          className={cn(
            "text-[color:var(--text-soft)]",
            compact ? "mt-1 text-[12px]" : "mt-2 text-[13px]",
          )}
        >
          {description}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  );
}

/** Footer for actions. */
export function DialogFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-6 flex flex-wrap items-center justify-end gap-2.5", className)}
      {...rest}
    />
  );
}
