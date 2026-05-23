import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn.js";

/** Weave-themed wrapper around Radix Dialog. The trigger is exposed
 *  directly via `Dialog.Trigger` (Radix Slot), the content sits inside
 *  `Dialog.Content` with overlay + entrance motion. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends DialogPrimitive.DialogContentProps {
  readonly children: ReactNode;
}

export function DialogContent({ className, children, ...rest }: DialogContentProps) {
  const reduced = useReducedMotion();
  const enter = reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };
  const initial = reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-40 bg-[color:var(--bg)]/55 backdrop-blur-[10px]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in data-[state=closed]:fade-out",
        )}
      />
      <DialogPrimitive.Content
        {...rest}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-[min(92vw,720px)] max-h-[88vh] overflow-auto",
          "rounded-[var(--radius-xl)] bg-[color:var(--surface-1)]",
          "border border-[color:var(--surface-1-border)]",
          "backdrop-blur-[var(--surface-blur)] shadow-[var(--shadow-glow)]",
          "p-6 md:p-8",
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

/** Convenience header — Title + optional description. Pairs with DialogContent. */
export function DialogHeader({
  title,
  description,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  readonly title: ReactNode;
  readonly description?: ReactNode;
}) {
  return (
    <div className={cn("mb-5", className)} {...rest}>
      <DialogPrimitive.Title
        className="text-[20px] md:text-[22px] font-semibold tracking-[-0.01em] text-[color:var(--text-strong)]"
      >
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-2 text-[13px] text-[color:var(--text-soft)]">
          {description}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  );
}

/** Footer for actions. */
export function DialogFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center justify-end gap-2.5",
        className,
      )}
      {...rest}
    />
  );
}
