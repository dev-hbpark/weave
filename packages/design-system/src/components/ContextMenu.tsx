import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { type ReactNode } from "react";
import { cn } from "../cn.js";

/** Right-click context menu styled with weave tokens.
 *
 *  ```tsx
 *  <ContextMenu>
 *    <ContextMenuTrigger asChild>
 *      <div>... right-click me</div>
 *    </ContextMenuTrigger>
 *    <ContextMenuContent>
 *      <ContextMenuItem onSelect={...}>Duplicate</ContextMenuItem>
 *      <ContextMenuSeparator />
 *      <ContextMenuItem onSelect={...} variant="danger">Delete</ContextMenuItem>
 *    </ContextMenuContent>
 *  </ContextMenu>
 *  ``` */
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
}

export function ContextMenuItem({
  className,
  variant = "default",
  shortcut,
  children,
  ...rest
}: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      {...rest}
      className={cn(
        "flex items-center justify-between gap-3",
        "px-2.5 py-1.5 rounded-[var(--radius-sm)]",
        "text-[13px] text-[color:var(--text-overlay)]",
        "outline-none cursor-pointer select-none",
        "data-[highlighted]:bg-[color:var(--surface-overlay-2)]",
        "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed",
        variant === "danger" &&
          "text-[color:var(--accent-strong)] data-[highlighted]:bg-[color:var(--accent-soft)]",
        className,
      )}
    >
      <span>{children}</span>
      {shortcut !== undefined ? (
        <span className="text-[11px] text-[color:var(--text-overlay-muted)] tracking-[0.06em]">
          {shortcut}
        </span>
      ) : null}
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuSeparator({ className }: { readonly className?: string }) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn(
        "h-px my-1 bg-[color:var(--surface-overlay-border)] -mx-1",
        className,
      )}
    />
  );
}
