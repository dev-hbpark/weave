import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ReactNode } from "react";
import { cn } from "../cn.js";

/** Radio group rendered as visual tiles (icon + title + tagline). Used by the
 *  new-design wizard to pick a document kind / size preset. */
export interface RadioTileGroupProps extends RadioGroupPrimitive.RadioGroupProps {
  readonly children?: ReactNode;
  /** Grid columns at md breakpoint. Default 2. */
  readonly cols?: 2 | 3 | 4;
}

export function RadioTileGroup({ className, children, cols = 2, ...rest }: RadioTileGroupProps) {
  const colClass = cols === 2 ? "md:grid-cols-2" : cols === 3 ? "md:grid-cols-3" : "md:grid-cols-4";
  return (
    <RadioGroupPrimitive.Root
      {...rest}
      className={cn("grid gap-3 grid-cols-1", colClass, className)}
    >
      {children}
    </RadioGroupPrimitive.Root>
  );
}

export interface RadioTileProps extends Omit<RadioGroupPrimitive.RadioGroupItemProps, "title"> {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly tagline?: ReactNode;
}

export function RadioTile({ className, icon, title, tagline, ...rest }: RadioTileProps) {
  return (
    <RadioGroupPrimitive.Item
      {...rest}
      className={cn(
        "group/tile relative text-left",
        "rounded-[var(--radius-lg)] p-4",
        "bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)]",
        "transition-[border-color,background,transform] duration-[var(--motion-normal)] ease-[var(--motion-spring-soft)]",
        "hover:border-[color:var(--border-strong)] hover:-translate-y-0.5",
        "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        "data-[state=checked]:border-[color:var(--accent)] data-[state=checked]:bg-[color:var(--accent-soft)]",
        "cursor-pointer",
        className,
      )}
    >
      {icon !== undefined ? (
        <div
          aria-hidden
          className="w-8 h-8 rounded-[var(--radius-md)] mb-3 flex items-center justify-center bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)] text-[color:var(--text-strong)] text-[16px] group-data-[state=checked]/tile:bg-[color:var(--accent)] group-data-[state=checked]/tile:text-[color:var(--bg)] group-data-[state=checked]/tile:border-transparent transition-colors duration-[var(--motion-normal)]"
        >
          {icon}
        </div>
      ) : null}
      <div className="text-[14px] font-medium text-[color:var(--text-strong)]">{title}</div>
      {tagline !== undefined ? (
        <div className="text-[12px] text-[color:var(--text-soft)] mt-1">{tagline}</div>
      ) : null}
    </RadioGroupPrimitive.Item>
  );
}
