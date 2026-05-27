// WI-016 Phase D — Tooltip capability types (DR-011).
//
// Open registry pattern, mirrors DR-009 (interactions) + DR-010 (manipulation).
// One adapter per item kind; new domains plug in by registering an adapter,
// not by editing a shared switch.

import type {
  AITooltipHotkeyTable,
  UseAITooltipTargetOptions,
} from "@weave/design-system";
import type { AgoItem, DomainKind } from "../types.js";

/**
 * Per-render state the describer needs to compute its tooltip output. Built
 * once in DesignPage and threaded through the `TooltipDescribeContext`
 * (global slices: canUndo / hotkeys) merged with per-item flags (selected /
 * entered / hovered) at the KindTooltip call site.
 */
export interface TooltipDescribeContext {
  readonly selected: boolean;
  readonly entered: boolean;
  readonly hovered: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hotkeys: AITooltipHotkeyTable;
}

/**
 * One adapter per `DomainKind`. The describer is intentionally pure — given
 * the same `(item, ctx)` it returns the same result — so callers can memoize
 * the output against (item, ctx) keys without surprises.
 */
export interface TooltipCapability<K extends DomainKind = DomainKind> {
  readonly targetKind: K;
  readonly describe: (
    item: AgoItem<K>,
    ctx: TooltipDescribeContext,
  ) => UseAITooltipTargetOptions;
}

export interface TooltipRegistry {
  /** Register an adapter. Returns a disposer; dev-warns on duplicate kind. */
  readonly register: <K extends DomainKind>(
    capability: TooltipCapability<K>,
  ) => () => void;
  readonly get: <K extends DomainKind>(
    kind: K,
  ) => TooltipCapability<K> | undefined;
  readonly list: () => ReadonlyArray<TooltipCapability>;
}
