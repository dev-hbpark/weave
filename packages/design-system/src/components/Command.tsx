// WI-026 Phase 3 — Command UI primitives.
//
// CommandHostContext carries a registry, a free-form `context` for
// enabledWhen evaluation, the active locale, and a dispatch function the
// host supplies. CommandButton / CommandKeycap / CommandMenuItem read
// from this context and render entirely from the command's metadata —
// label, hotkey, description, enabledWhen are all looked up by id.
//
// The host (weave) wires `@agocraft/core`'s `CommandMetadataRegistry`
// into this context; the design-system stays agocraft-agnostic via the
// structural `CommandRegistryLike` interface below.
//
// OS Rule 6 (declarative branching via context dispatch) — adding a new
// command never touches any of these components. The component asks the
// registry; the registry resolves; the metadata drives the render.

import {
  createContext,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { Button } from "./Button.js";
import { DropdownMenuItem } from "./DropdownMenu.js";
import { IconButton } from "./IconButton.js";
import { Kbd } from "./Kbd.js";

/** Locale identifier the host renders in. */
export type CommandLocaleLike = "en" | "ko";

/** Structural mirror of agocraft's `CommandMetadata`. Host passes the
 *  agocraft type as-is; TypeScript checks structurally. */
export interface CommandMetaLike {
  readonly id: string;
  readonly label: Readonly<Partial<Record<CommandLocaleLike, string>>> &
    Readonly<Record<string, string>>;
  readonly description?: Readonly<Record<string, string>>;
  readonly hint?: Readonly<Record<string, string>>;
  readonly icon?: string;
  readonly hotkey?: {
    readonly keys: string;
    readonly binding?: string;
    readonly scope?: string;
  };
  readonly category?: string;
  readonly enabledWhen?: (ctx: Readonly<Record<string, unknown>>) => boolean;
  readonly visibleWhen?: (ctx: Readonly<Record<string, unknown>>) => boolean;
}

/** Structural mirror of agocraft's `CommandMetadataRegistry`. */
export interface CommandRegistryLike {
  resolve(id: string): CommandMetaLike | undefined;
  list(filter?: { readonly category?: string }): ReadonlyArray<CommandMetaLike>;
  isEnabled(id: string, ctx: Readonly<Record<string, unknown>>): boolean;
  /** WI-027 — snapshot of every command whose `visibleWhen(ctx)` is true.
   *  Hover affordances / quick-action bars read from here. Optional on
   *  the structural type so older registries (without listVisible) still
   *  compile; consumers should null-guard. */
  listVisible?(ctx: Readonly<Record<string, unknown>>): ReadonlyArray<CommandMetaLike>;
}

export interface CommandHostValue {
  readonly registry: CommandRegistryLike;
  /** Free-form predicate context for enabledWhen (mode / selection /
   *  canUndo / etc.). Reference equality drives re-render — host MUST
   *  treat this as immutable and produce a new object when state changes. */
  readonly context: Readonly<Record<string, unknown>>;
  readonly locale: CommandLocaleLike;
  /** Host-supplied executor. Invoked when the user activates a command
   *  (click / keyboard / palette selection). The host decides whether to
   *  call `editor.exec(id, …)`, run a local action, etc. */
  readonly dispatch: (id: string) => void;
}

const CommandHostContext = createContext<CommandHostValue | undefined>(undefined);

export interface CommandHostProviderProps extends CommandHostValue {
  readonly children: ReactNode;
}

export function CommandHostProvider({ children, ...value }: CommandHostProviderProps) {
  // Stable value identity — caller is expected to memoize each field;
  // we don't recreate the object unless one changes.
  const memo = useMemo<CommandHostValue>(
    () => value,
    [value.registry, value.context, value.locale, value.dispatch],
  );
  return <CommandHostContext.Provider value={memo}>{children}</CommandHostContext.Provider>;
}

export function useCommandHost(): CommandHostValue {
  const ctx = useContext(CommandHostContext);
  if (ctx === undefined) {
    throw new Error("useCommandHost() called outside <CommandHostProvider>.");
  }
  return ctx;
}

export function useCommandHostOrNull(): CommandHostValue | null {
  return useContext(CommandHostContext) ?? null;
}

function pickLocalized(
  bag: Readonly<Record<string, string>> | undefined,
  locale: CommandLocaleLike,
): string | undefined {
  if (bag === undefined) return undefined;
  return bag[locale] ?? bag.en ?? Object.values(bag)[0];
}

export interface ResolvedCommand {
  readonly id: string;
  readonly meta: CommandMetaLike | undefined;
  readonly label: string;
  readonly description: string | undefined;
  readonly hint: string | undefined;
  readonly hotkeyDisplay: string | undefined;
  readonly enabled: boolean;
}

/** Resolve a command's render-ready strings against the current host.
 *  Returns a stable shape so callers can render unconditionally — if the
 *  command id is unknown, `meta` is undefined, `label` is the id itself
 *  (so a broken reference is visible in development), and `enabled` is
 *  false (fail-closed). */
export function useResolvedCommand(commandId: string): ResolvedCommand {
  const host = useCommandHost();
  return useMemo<ResolvedCommand>(() => {
    const meta = host.registry.resolve(commandId);
    const label =
      meta !== undefined ? (pickLocalized(meta.label, host.locale) ?? commandId) : commandId;
    return {
      id: commandId,
      meta,
      label,
      description: meta && pickLocalized(meta.description, host.locale),
      hint: meta && pickLocalized(meta.hint, host.locale),
      hotkeyDisplay: meta?.hotkey?.keys,
      enabled: host.registry.isEnabled(commandId, host.context),
    };
  }, [host.registry, host.context, host.locale, commandId]);
}

// ---------------------------------------------------------------------------
// CommandButton — Button driven by command metadata.
// ---------------------------------------------------------------------------

interface CommandButtonOwnProps {
  readonly commandId: string;
  readonly variant?: "primary" | "ghost" | "subtle";
  readonly size?: "md" | "lg";
  /** Override the rendered label. Default: `resolveLabel(meta, locale)`. */
  readonly children?: ReactNode;
  /** Append icon before the label. */
  readonly leadingIcon?: ReactNode;
  /** Append icon after the label. Default: keycap chip when hotkey present. */
  readonly trailingIcon?: ReactNode;
  readonly className?: string;
  /** Suppress the automatic keycap. */
  readonly hideHotkey?: boolean;
  /** Additional onClick — runs AFTER dispatch unless the host's dispatch
   *  throws. Useful for closing menus / blurring etc. */
  readonly onClick?: (e: MouseEvent<HTMLElement>) => void;
}

export const CommandButton = forwardRef<HTMLButtonElement, CommandButtonOwnProps>(
  function CommandButton(props, ref) {
    const {
      commandId,
      variant = "ghost",
      size = "md",
      children,
      leadingIcon,
      trailingIcon,
      className,
      hideHotkey = false,
      onClick,
    } = props;
    const host = useCommandHost();
    const resolved = useResolvedCommand(commandId);
    const handleClick = useCallback(
      (e: MouseEvent<HTMLElement>) => {
        if (!resolved.enabled) return;
        host.dispatch(commandId);
        onClick?.(e);
      },
      [host, commandId, resolved.enabled, onClick],
    );
    const tipText = resolved.hint ?? resolved.label;
    const computedTrailing =
      trailingIcon ??
      (!hideHotkey && resolved.hotkeyDisplay !== undefined ? (
        <Kbd size="sm" combo>
          {resolved.hotkeyDisplay}
        </Kbd>
      ) : undefined);
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={className}
        disabled={!resolved.enabled}
        aria-label={resolved.label}
        aria-keyshortcuts={resolved.hotkeyDisplay}
        data-tip={tipText}
        {...(resolved.hotkeyDisplay !== undefined ? { "data-tip-kbd": resolved.hotkeyDisplay } : {})}
        data-tip-id={`cmd:${commandId}`}
        data-tip-disabled={!resolved.enabled ? "true" : undefined}
        leadingIcon={leadingIcon}
        trailingIcon={computedTrailing}
        onClick={handleClick}
        data-testid={`cmd-${commandId.replace(/\./g, "-")}`}
        data-cmd-id={commandId}
      >
        {children ?? resolved.label}
      </Button>
    );
  },
);

// ---------------------------------------------------------------------------
// CommandIconButton — square icon button driven by command metadata.
// ---------------------------------------------------------------------------

export interface CommandIconButtonProps {
  readonly commandId: string;
  readonly children: ReactNode;
  readonly variant?: "ghost" | "subtle" | "danger";
  readonly size?: "sm" | "md";
  readonly className?: string;
  readonly onClick?: (e: MouseEvent<HTMLElement>) => void;
}

export const CommandIconButton = forwardRef<HTMLButtonElement, CommandIconButtonProps>(
  function CommandIconButton(props, ref) {
    const { commandId, children, variant = "ghost", size = "sm", className, onClick } = props;
    const host = useCommandHost();
    const resolved = useResolvedCommand(commandId);
    const handleClick = useCallback(
      (e: MouseEvent<HTMLElement>) => {
        if (!resolved.enabled) return;
        host.dispatch(commandId);
        onClick?.(e);
      },
      [host, commandId, resolved.enabled, onClick],
    );
    const tipText = resolved.hint ?? resolved.label;
    return (
      <IconButton
        ref={ref}
        aria-label={resolved.label}
        aria-keyshortcuts={resolved.hotkeyDisplay}
        data-tip={tipText}
        {...(resolved.hotkeyDisplay !== undefined ? { "data-tip-kbd": resolved.hotkeyDisplay } : {})}
        data-tip-id={`cmd:${commandId}`}
        data-tip-disabled={!resolved.enabled ? "true" : undefined}
        variant={variant}
        size={size}
        className={className}
        disabled={!resolved.enabled}
        onClick={handleClick}
        data-testid={`cmd-${commandId.replace(/\./g, "-")}`}
        data-cmd-id={commandId}
      >
        {children}
      </IconButton>
    );
  },
);

// ---------------------------------------------------------------------------
// CommandKeycap — keycap only (no button).
// ---------------------------------------------------------------------------

export interface CommandKeycapProps {
  readonly commandId: string;
  readonly size?: "sm" | "md";
  readonly className?: string;
}

export function CommandKeycap({ commandId, size = "sm", className }: CommandKeycapProps) {
  const resolved = useResolvedCommand(commandId);
  if (resolved.hotkeyDisplay === undefined) return null;
  return (
    <Kbd size={size} combo className={className}>
      {resolved.hotkeyDisplay}
    </Kbd>
  );
}

// ---------------------------------------------------------------------------
// CommandMenuItem — DropdownMenuItem driven by metadata.
// ---------------------------------------------------------------------------

export interface CommandMenuItemProps {
  readonly commandId: string;
  readonly children?: ReactNode;
}

export function CommandMenuItem({ commandId, children }: CommandMenuItemProps) {
  const host = useCommandHost();
  const resolved = useResolvedCommand(commandId);
  const onSelect = useCallback(() => {
    if (!resolved.enabled) return;
    host.dispatch(commandId);
  }, [host, commandId, resolved.enabled]);
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      disabled={!resolved.enabled}
      shortcut={resolved.hotkeyDisplay}
      data-testid={`cmd-menu-${commandId.replace(/\./g, "-")}`}
      data-cmd-id={commandId}
    >
      {children ?? resolved.label}
    </DropdownMenuItem>
  );
}
