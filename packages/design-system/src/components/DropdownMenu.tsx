import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { type ReactNode } from "react";
import { cn } from "../cn.js";

/** Trigger-based menu (button click → menu). Shares its visual surface with
 *  ContextMenu — same Aurora-glass tokens, same row treatment. */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  children,
  align = "start",
  sideOffset = 6,
  ...rest
}: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        {...rest}
        className={cn(
          "z-50 min-w-[220px] p-1",
          // Theme-independent dark glass overlay — readable over the user's
          // design canvas regardless of its background color.
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
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends DropdownMenuPrimitive.DropdownMenuItemProps {
  readonly icon?: ReactNode;
  readonly tagline?: ReactNode;
  readonly shortcut?: ReactNode;
  readonly variant?: "default" | "danger";
}

export function DropdownMenuItem({
  className,
  icon,
  tagline,
  shortcut,
  variant = "default",
  children,
  ...rest
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      {...rest}
      className={cn(
        "flex items-start gap-2.5",
        "px-2.5 py-2 rounded-[var(--radius-sm)]",
        "text-[13px] text-[color:var(--text-overlay)]",
        "outline-none cursor-pointer select-none",
        "data-[highlighted]:bg-[color:var(--surface-overlay-2)]",
        "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed",
        variant === "danger" &&
          "text-[color:var(--accent-strong)] data-[highlighted]:bg-[color:var(--accent-soft)]",
        className,
      )}
    >
      {icon !== undefined ? (
        <span aria-hidden className="mt-0.5 inline-flex w-4 h-4 items-center justify-center text-[color:var(--text-overlay-soft)]">
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
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator({ className }: { readonly className?: string }) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn(
        "h-px my-1 bg-[color:var(--surface-overlay-border)] -mx-1",
        className,
      )}
    />
  );
}

export function DropdownMenuLabel({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        "px-2.5 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-overlay-soft)]",
        className,
      )}
    >
      {children}
    </DropdownMenuPrimitive.Label>
  );
}
