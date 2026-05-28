// DR-design-021 — Select (combobox) primitive.
//
// Single-select enum picker rendered as a compact trigger (current value's
// icon + label + chevron) that opens a checkmarked radio list. The API
// mirrors SegmentedControl so a section can swap a wide segmented row for a
// compact combobox without reshaping its option data.
//
// Use Select when: ≥5 options, OR long text labels, OR horizontal space is
// tight (the trigger shows only the current value). Use SegmentedControl for
// ≤4 instant icon toggles that benefit from all-options-visible.
//
// Built on @radix-ui/react-dropdown-menu (already a dependency) RadioGroup /
// RadioItem — no new runtime dep. Tree-shake: ESM, sideEffects:false, no
// decorators, named export.

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { cn } from "../cn.js";
import { useDismissOnOutsidePointer } from "../lib/use-dismiss-on-outside-pointer.js";
import { IconCheck, IconChevronDown } from "./Icon.js";

export interface SelectOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface SelectProps<V extends string> {
  /** Current value. Pass `""` to render the placeholder (e.g. a Mixed
   *  multi-selection where the items disagree). */
  readonly value: V | "";
  readonly onValueChange: (next: V) => void;
  readonly options: ReadonlyArray<SelectOption<V>>;
  readonly "aria-label"?: string;
  /** Shown on the trigger when `value === ""`. Default "선택". */
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Width hint for the trigger. Default "auto" (fits content). */
  readonly triggerClassName?: string;
  readonly "data-testid"?: string;
}

function SelectInner<V extends string>({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  placeholder = "선택",
  disabled,
  className,
  triggerClassName,
  "data-testid": testid,
}: SelectProps<V>): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const handleDismiss = useCallback(() => setOpen(false), []);
  useDismissOnOutsidePointer({ open, onDismiss: handleDismiss, triggerRef });

  const selected = options.find((o) => o.value === value);

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownMenuPrimitive.Trigger
        ref={triggerRef}
        disabled={disabled}
        {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
        {...(testid !== undefined ? { "data-testid": testid } : {})}
        className={cn(
          "inline-flex items-center gap-1.5 min-w-0",
          "h-7 px-2 rounded-[6px]",
          "text-[12px] text-[color:var(--text-overlay)]",
          "bg-[color:var(--surface-overlay-2)]",
          "border border-[color:var(--surface-overlay-border)]",
          "hover:bg-[color:var(--surface-overlay)]",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
          "data-[state=open]:border-[color:var(--accent-soft)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          "transition-[background,border-color] duration-[var(--motion-quick)]",
          triggerClassName,
        )}
      >
        {selected?.icon !== undefined ? (
          <span aria-hidden className="inline-flex shrink-0">
            {selected.icon}
          </span>
        ) : null}
        <span className="truncate flex-1 text-left">{selected?.label ?? placeholder}</span>
        <IconChevronDown size={13} className="shrink-0 text-[color:var(--text-overlay-muted)]" />
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-[60vh] overflow-auto p-1",
            "rounded-[var(--radius-md)] bg-[color:var(--surface-overlay)]",
            "border border-[color:var(--surface-overlay-border)]",
            "backdrop-blur-[var(--surface-blur)] shadow-[var(--shadow-overlay)]",
            "focus-visible:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in data-[state=closed]:fade-out",
            className,
          )}
        >
          <DropdownMenuPrimitive.RadioGroup
            value={value}
            onValueChange={(v) => {
              if (v !== "") onValueChange(v as V);
            }}
          >
            {options.map((o) => (
              <DropdownMenuPrimitive.RadioItem
                key={o.value}
                value={o.value}
                {...(testid !== undefined ? { "data-testid": `${testid}-option-${o.value}` } : {})}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)]",
                  "text-[12px] text-[color:var(--text-overlay)]",
                  "outline-none cursor-pointer select-none",
                  "data-[highlighted]:bg-[color:var(--surface-overlay-2)]",
                  "data-[state=checked]:text-[color:var(--text-overlay)]",
                )}
              >
                <span className="inline-flex w-4 h-4 items-center justify-center shrink-0 text-[color:var(--accent-strong)]">
                  <DropdownMenuPrimitive.ItemIndicator>
                    <IconCheck size={14} />
                  </DropdownMenuPrimitive.ItemIndicator>
                </span>
                {o.icon !== undefined ? (
                  <span
                    aria-hidden
                    className="inline-flex shrink-0 text-[color:var(--text-overlay-soft)]"
                  >
                    {o.icon}
                  </span>
                ) : null}
                <span className="flex-1">{o.label}</span>
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuPrimitive.RadioGroup>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export const Select = SelectInner as <V extends string>(props: SelectProps<V>) => JSX.Element;
