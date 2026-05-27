// WI-027 Phase C — QuickActionBar.
//
// Figma-style floating action strip anchored to the hovered surface
// (top-right of a frame by default). Lists every command whose
// `visibleWhen` matches the current host context and renders each as a
// `CommandIconButton`. Adding a new command never touches this file —
// declare `visibleWhen` on the command and it auto-appears here.
//
// The bar is intentionally generic. The host decides:
//   • where to mount it (per-frame absolute, or global cursor-following)
//   • what icon a command maps to (CommandMetadata.icon is a host token)
//   • category filter — limit to e.g. only "frame" commands

import { type ReactNode, useMemo } from "react";
import { cn } from "../cn.js";
import { useCommandHostOrNull } from "./Command.js";

export interface QuickActionBarProps {
  /** Restrict to commands tagged with this category. Default: all
   *  categories. */
  readonly category?: string;
  /** Override the host's context for visibleWhen / isEnabled. Default:
   *  the CommandHostProvider's context. Useful when a section wants to
   *  layer in extra keys (e.g. hoveredKind / hoveredId). */
  readonly contextOverride?: Readonly<Record<string, unknown>>;
  /** Maximum commands to show. The remaining are hidden — the user can
   *  open the palette (Cmd+K) to find them. Default: 6. */
  readonly maxItems?: number;
  /** Renderer for each visible command. Receives the command id; should
   *  return a ReactNode (typically `<CommandIconButton commandId={id}>
   *  <SomeIcon /></CommandIconButton>`). Host owns the icon mapping. */
  readonly renderItem: (commandId: string) => ReactNode;
  /** Render when zero commands match. Default: render nothing. */
  readonly emptyFallback?: ReactNode;
  /** Drop these ids before rendering. Use when a command is registered
   *  for hotkey / palette / future surfaces but should NOT appear as
   *  a separate inline button on the bar (e.g. a set of fine-grained
   *  ops that are surfaced via one submenu button instead). */
  readonly excludeIds?: ReadonlySet<string>;
  /** Pin these ids to the END of the visible list, preserving their
   *  relative order. Use to anchor "destructive" actions like delete
   *  (✕) on the rightmost edge regardless of registry order. Ids that
   *  aren't present after `excludeIds` filtering are silently ignored. */
  readonly pinToEndIds?: ReadonlySet<string>;
  /** WI-036 / DR-design-012 — hover target union. When true, the root
   *  div carries `data-quick-actions-bar="true"` so a host's hover
   *  tracker can treat pointer-over-the-bar as a continuation of the
   *  underlying frame's hover. Without this, moving the mouse from a
   *  frame to a floating bar crosses an empty gap, fires `mouseleave`
   *  on the frame, and the bar's visible commands collapse before the
   *  click. Default: true. */
  readonly hoverTargetUnion?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function QuickActionBar({
  category,
  contextOverride,
  maxItems = 6,
  renderItem,
  emptyFallback = null,
  excludeIds,
  pinToEndIds,
  hoverTargetUnion = true,
  className,
  "data-testid": testid = "quick-action-bar",
}: QuickActionBarProps): ReactNode {
  const host = useCommandHostOrNull();

  const commandIds = useMemo<ReadonlyArray<string>>(() => {
    if (host === null) return [];
    const ctx =
      contextOverride !== undefined ? { ...host.context, ...contextOverride } : host.context;
    // Older registries (pre-WI-027) may not implement listVisible —
    // fall back to filtering list() in that case.
    const lister = host.registry.listVisible;
    const all =
      typeof lister === "function"
        ? lister.call(host.registry, ctx)
        : host.registry.list().filter((m) => m.visibleWhen !== undefined && m.visibleWhen(ctx));
    const filtered = category !== undefined ? all.filter((m) => m.category === category) : all;
    let ids = filtered.map((m) => m.id);
    if (excludeIds !== undefined) {
      ids = ids.filter((id) => !excludeIds.has(id));
    }
    if (pinToEndIds !== undefined) {
      // Stable partition — non-pinned ids keep their registry order,
      // pinned ids are appended in registry order. So a host can pin
      // multiple ids (e.g. both `frame.delete` AND `multi.delete`) and
      // each ends up rightmost in the context where it's visible
      // without the host having to know which one is active.
      const head: string[] = [];
      const tail: string[] = [];
      for (const id of ids) {
        if (pinToEndIds.has(id)) tail.push(id);
        else head.push(id);
      }
      ids = [...head, ...tail];
    }
    return ids.slice(0, maxItems);
  }, [host, category, contextOverride, maxItems, excludeIds, pinToEndIds]);

  if (host === null) return null;
  if (commandIds.length === 0) return emptyFallback;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-1 rounded-[var(--radius-pill)]",
        "bg-[color:var(--surface-overlay)] backdrop-blur-[var(--surface-blur)]",
        "border border-[color:var(--surface-overlay-border)]",
        "shadow-[var(--shadow-glow)]",
        "pointer-events-auto",
        className,
      )}
      data-testid={testid}
      {...(hoverTargetUnion ? { "data-quick-actions-bar": "true" } : {})}
      role="toolbar"
      aria-label="Quick actions"
    >
      {commandIds.map((id) => (
        <span key={id}>{renderItem(id)}</span>
      ))}
    </div>
  );
}
