// WI-016 Phase D — Tooltip registry (DR-011).
//
// Mirrors DR-010's manipulation registry shape one-for-one: a Map keyed by
// `targetKind`, register/get/list, dev-warning on duplicate registration.

import type { DomainKind } from "../types.js";
import type { TooltipCapability, TooltipRegistry } from "./types.js";

export function createTooltipRegistry(): TooltipRegistry {
  const adapters = new Map<DomainKind, TooltipCapability>();

  function register<K extends DomainKind>(capability: TooltipCapability<K>): () => void {
    if (adapters.has(capability.targetKind)) {
      console.warn(
        `[tooltip-registry] Capability for kind "${capability.targetKind}" already registered. Keeping the first; second call ignored.`,
      );
      return () => undefined;
    }
    adapters.set(capability.targetKind, capability as unknown as TooltipCapability);
    return () => {
      adapters.delete(capability.targetKind);
    };
  }

  return {
    register,
    get: <K extends DomainKind>(kind: K) => adapters.get(kind) as TooltipCapability<K> | undefined,
    list: () => Array.from(adapters.values()),
  };
}
