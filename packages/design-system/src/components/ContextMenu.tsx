import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { cn } from "../cn.js";

/** Right-click context menu styled with weave tokens.
 *
 *  ```tsx
 *  <ContextMenu>
 *    <ContextMenuTrigger asChild>
 *      <div>... right-click me</div>
 *    </ContextMenuTrigger>
 *    <ContextMenuContent>
 *      <ContextMenuLabel>Select layer</ContextMenuLabel>
 *      <ContextMenuGroup aria-label="Select layer">
 *        <ContextMenuItem icon={<Swatch/>} tagline="320 × 180" onSelect={...}>
 *          Frame 3
 *        </ContextMenuItem>
 *      </ContextMenuGroup>
 *      <ContextMenuSeparator />
 *      <ContextMenuItem onSelect={...} variant="danger">Delete</ContextMenuItem>
 *    </ContextMenuContent>
 *  </ContextMenu>
 *  ``` */
// DR-design-013 — ContextMenu is intentionally not wrapped with the
// capture-phase dismiss backstop: Radix's ContextMenu has no controlled
// `open` prop, so we cannot programmatically close it. If the canvas's
// `stopPropagation` ever surfaces an outside-click dismiss regression in
// ContextMenu, the fix path is to dispatch a synthetic `Escape` keydown
// from the backstop (Radix listens for Esc at the document level in capture
// phase). Deferred — no user-reported symptom for ContextMenu today.
export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
  className,
  children,
  ...rest
}: ContextMenuPrimitive.ContextMenuContentProps) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        {...rest}
        className={cn(
          "z-50 min-w-[200px] p-1",
          "rounded-[var(--radius-md)] bg-[color:var(--surface-overlay)]",
          "border border-[color:var(--surface-overlay-border)]",
          "backdrop-blur-[var(--surface-blur)] shadow-[var(--shadow-overlay)]",
          "focus-visible:outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in data-[state=closed]:fade-out",
          className,
        )}
      >
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export interface ContextMenuItemProps extends ContextMenuPrimitive.ContextMenuItemProps {
  readonly variant?: "default" | "danger";
  readonly shortcut?: ReactNode;
  readonly icon?: ReactNode;
  readonly tagline?: ReactNode;
}

export function ContextMenuItem({
  className,
  variant = "default",
  shortcut,
  icon,
  tagline,
  children,
  ...rest
}: ContextMenuItemProps) {
  const hasMultiLineSlots = icon !== undefined || tagline !== undefined;
  return (
    <ContextMenuPrimitive.Item
      {...rest}
      className={cn(
        hasMultiLineSlots
          ? "flex items-start gap-2.5 px-2.5 py-2"
          : "flex items-center justify-between gap-3 px-2.5 py-1.5",
        "rounded-[var(--radius-sm)]",
        "text-[13px] text-[color:var(--text-overlay)]",
        "outline-none cursor-pointer select-none",
        "data-[highlighted]:bg-[color:var(--surface-overlay-2)]",
        "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed",
        variant === "danger" &&
          "text-[color:var(--accent-strong)] data-[highlighted]:bg-[color:var(--accent-soft)]",
        className,
      )}
    >
      {hasMultiLineSlots ? (
        <>
          {icon !== undefined ? (
            <span
              aria-hidden
              className="mt-0.5 inline-flex w-4 h-4 items-center justify-center text-[color:var(--text-overlay-soft)]"
            >
              {icon}
            </span>
          ) : null}
          <span className="flex-1 grid">
            <span>{children}</span>
            {tagline !== undefined ? (
              <span className="text-[12px] text-[color:var(--text-overlay-muted)]">{tagline}</span>
            ) : null}
          </span>
          {shortcut !== undefined ? (
            <span className="text-[11px] text-[color:var(--text-overlay-muted)] tracking-[0.06em] self-center">
              {shortcut}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span>{children}</span>
          {shortcut !== undefined ? (
            <span className="text-[11px] text-[color:var(--text-overlay-muted)] tracking-[0.06em]">
              {shortcut}
            </span>
          ) : null}
        </>
      )}
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuSeparator({ className }: { readonly className?: string }) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn("h-px my-1 bg-[color:var(--surface-overlay-border)] -mx-1", className)}
    />
  );
}

export function ContextMenuLabel({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <ContextMenuPrimitive.Label
      className={cn(
        "px-2.5 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-overlay-soft)]",
        className,
      )}
    >
      {children}
    </ContextMenuPrimitive.Label>
  );
}

export function ContextMenuGroup({
  className,
  children,
  ...rest
}: {
  readonly className?: string;
  readonly children: ReactNode;
  readonly "aria-label"?: string;
}) {
  return (
    <ContextMenuPrimitive.Group {...rest} className={cn(className)}>
      {children}
    </ContextMenuPrimitive.Group>
  );
}

/** Nested sub-menu primitives (WI-039 "Move to…" picker). Radix
 *  exposes Sub / SubTrigger / SubContent — we wrap them with the same
 *  weave token styling as the top-level menu so a sub-tree of frames
 *  can be rendered inline (no separate Dialog) on right-click. */
export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuSubTrigger({
  className,
  children,
  ...rest
}: ContextMenuPrimitive.ContextMenuSubTriggerProps) {
  return (
    <ContextMenuPrimitive.SubTrigger
      {...rest}
      className={cn(
        "flex items-center justify-between gap-3 px-2.5 py-1.5",
        "rounded-[var(--radius-sm)]",
        "text-[13px] text-[color:var(--text-overlay)]",
        "outline-none cursor-pointer select-none",
        "data-[highlighted]:bg-[color:var(--surface-overlay-2)]",
        "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed",
        "data-[state=open]:bg-[color:var(--surface-overlay-2)]",
        className,
      )}
    >
      <span className="flex-1">{children}</span>
      <span aria-hidden className="text-[11px] text-[color:var(--text-overlay-muted)]">
        ▸
      </span>
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  children,
  ...rest
}: ContextMenuPrimitive.ContextMenuSubContentProps) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        {...rest}
        className={cn(
          "z-50 min-w-[200px] max-h-[60vh] overflow-auto p-1",
          "rounded-[var(--radius-md)] bg-[color:var(--surface-overlay)]",
          "border border-[color:var(--surface-overlay-border)]",
          "backdrop-blur-[var(--surface-blur)] shadow-[var(--shadow-overlay)]",
          "focus-visible:outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in data-[state=closed]:fade-out",
          className,
        )}
      >
        {children}
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
}
