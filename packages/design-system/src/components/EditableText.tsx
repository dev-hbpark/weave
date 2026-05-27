import { motion, useReducedMotion } from "motion/react";
import {
  type FocusEvent,
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "../cn.js";

// EditableText — DR-design-003.
//
// Contract:
//   - Uncontrolled. The DOM's textContent is the source of truth between edits;
//     React state stores only the *initial* value and the editing flag.
//   - onCommit fires on blur AND on Enter (when multiline=false). The committed
//     text is the trimmed final textContent.
//   - Esc reverts to the initial value and blurs.
//   - aria-label is required (callers pass a descriptive label so screen readers
//     announce what is being edited).

export interface EditableTextHandle {
  /** Focus this field and place caret at end. */
  focusEnd: () => void;
}

interface EditableTextProps {
  readonly value: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly className?: string;
  readonly ariaLabel: string;
  readonly onCommit: (next: string) => void;
  /** Fired when user presses Enter in a single-line field. Receives the *committed* text. */
  readonly onEnterCommit?: (next: string) => void;
  /** Fired when user presses Backspace on an empty field — useful for "remove this bullet". */
  readonly onBackspaceEmpty?: () => void;
  readonly onFocus?: (e: FocusEvent<HTMLDivElement>) => void;
  readonly onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
  /** Render-as element. Default span; use "div" for multiline blocks. */
  readonly as?: "span" | "div";
  /** When should the user enter edit mode?
   *  - "single" (default) — element is always contenteditable; a single
   *    click focuses it and the user can type immediately. Use this for
   *    standalone inputs.
   *  - "double" — element is NOT contenteditable until the user double-
   *    clicks. Single clicks pass through to the parent (frame selection
   *    / drag-move). Used for inline text inside a frame so the user can
   *    still pick the frame up with a click. */
  readonly clickToEdit?: "single" | "double";
  /** Arbitrary extra props forwarded to the underlying element — used by
   *  callers to attach `data-hover-context` / `data-hover-actions` so the
   *  cursor tooltip can describe each editable field individually. */
  readonly [key: `data-${string}`]: string | undefined;
}

export const EditableText = forwardRef<EditableTextHandle, EditableTextProps>(
  (
    {
      value,
      placeholder,
      multiline = false,
      className,
      ariaLabel,
      onCommit,
      onEnterCommit,
      onBackspaceEmpty,
      onFocus,
      onBlur,
      as = "span",
      clickToEdit = "single",
      ...rest
    },
    ref,
  ) => {
    // For double-click-to-edit mode the element starts NOT contenteditable
    // so the underlying frame's selection / drag handlers see the click.
    // dblclick flips to true and focuses; blur reverts.
    const [isEditing, setIsEditing] = useState(clickToEdit === "single");
    const elRef = useRef<HTMLDivElement | HTMLSpanElement | null>(null);
    const reduce = useReducedMotion();
    const [flash, setFlash] = useState(false);

    // Sync the DOM textContent when the *external* value changes and the field
    // is not currently focused. Don't overwrite while the user is typing.
    useEffect(() => {
      const el = elRef.current;
      if (el === null) return;
      if (document.activeElement === el) return;
      if (el.textContent !== value) el.textContent = value;
    }, [value]);

    useImperativeHandle(
      ref,
      () => ({
        focusEnd: () => {
          const el = elRef.current;
          if (el === null) return;
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          if (sel !== null) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        },
      }),
      [],
    );

    function commit(): string {
      const el = elRef.current;
      // For multiline fields the user can insert `<br>` / `<div>` blocks
      // via Enter — `textContent` flattens those and concatenates without
      // newlines (so "Line 1<br>Line 2" → "Line 1Line 2"). `innerText`
      // preserves the visual line breaks as `\n`. Single-line fields use
      // textContent (Enter is preventDefaulted, so there are no breaks
      // to worry about, and `innerText` triggers a layout flush we'd
      // rather avoid on every commit).
      const raw =
        el === null ? "" : multiline ? (el as HTMLElement).innerText : (el.textContent ?? "");
      const next = raw.trim();
      if (next !== value) {
        onCommit(next);
        if (!reduce) {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 220);
        }
      }
      return next;
    }

    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
      if (e.key === "Escape") {
        e.preventDefault();
        const el = elRef.current;
        if (el !== null) el.textContent = value;
        el?.blur();
        return;
      }
      if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        const committed = commit();
        onEnterCommit?.(committed);
        return;
      }
      if (e.key === "Backspace") {
        const el = elRef.current;
        if (el !== null && (el.textContent ?? "").length === 0) {
          e.preventDefault();
          onBackspaceEmpty?.();
        }
      }
    }

    function handleBlur(e: FocusEvent<HTMLDivElement>): void {
      commit();
      onBlur?.(e);
      if (clickToEdit === "double") setIsEditing(false);
    }

    function handleDoubleClick(): void {
      if (typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).__editableDblClick =
          (((window as unknown as Record<string, unknown>).__editableDblClick as
            | number
            | undefined) ?? 0) + 1;
      }
      if (clickToEdit !== "double") return;
      setIsEditing(true);
      // Also flip contentEditable on the DOM synchronously so we can focus
      // in the same task. React will still reconcile on the next render
      // (matching attribute → no-op). Without this, the focus call below
      // (or the user's immediate keystroke) lands before React applies
      // contentEditable=true — and a contenteditable=false element can't
      // hold the caret.
      const el = elRef.current;
      if (el === null) return;
      el.setAttribute("contenteditable", "true");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      if (sel !== null) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // After React commits `contentEditable=true` to the DOM, focus the
    // element and select all its contents so the user can immediately
    // type to replace, or click again to position the caret.
    useEffect(() => {
      if (!isEditing || clickToEdit !== "double") return;
      const el = elRef.current;
      if (el === null) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      if (sel !== null) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, [isEditing, clickToEdit]);

    const Comp = (as === "div" ? motion.div : motion.span) as typeof motion.div;
    const flashProps = flash
      ? {
          animate: { opacity: [1, 0.55, 1] },
          transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
        }
      : {};

    return (
      <Comp
        // contentEditable plus suppressContentEditableWarning because we deliberately
        // sidestep React's reconciliation for the text node.
        contentEditable={isEditing}
        suppressContentEditableWarning
        ref={(el) => {
          elRef.current = el as HTMLDivElement | HTMLSpanElement | null;
        }}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        data-placeholder={placeholder}
        data-double-click-edit={clickToEdit === "double" ? "true" : undefined}
        spellCheck={false}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={handleBlur}
        onDoubleClick={handleDoubleClick}
        {...flashProps}
        {...rest}
        className={cn(
          "outline-none rounded-[var(--radius-sm)] -mx-1 px-1",
          // Quiet by default — chrome only on hover/focus. Empty-state
          // placeholder uses the soft muted token; on light document
          // canvases that resolves to ~0.4 alpha dark ink so the hint is
          // legible without competing with real content.
          "hover:bg-[color:var(--surface-1)]",
          "focus-visible:bg-[color:var(--surface-1)]",
          "focus-visible:shadow-[var(--focus-ring)]",
          "transition-colors duration-[var(--motion-quick)]",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-[color:var(--text-muted)] empty:before:opacity-70",
          // In double-click-to-edit mode, the inactive state shouldn't
          // advertise a text cursor — the user should feel they're
          // interacting with the FRAME, not the text. text cursor
          // appears only while editing.
          isEditing ? "cursor-text" : "cursor-default",
          className,
        )}
      >
        {value}
      </Comp>
    );
  },
);

EditableText.displayName = "EditableText";
