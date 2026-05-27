// WI-017 Phase D — Insertable registry (DR-012).
//
// Mirrors DR-010's manipulation registry one-for-one: Map keyed by
// `containerKind`, register/get/list, dev-warning on duplicate.

import type { ContainerKind, InsertableCapability, InsertableRegistry } from "./types.js";

export function createInsertableRegistry(): InsertableRegistry {
  const adapters = new Map<ContainerKind, InsertableCapability>();

  function register<K extends ContainerKind>(capability: InsertableCapability<K>): () => void {
    if (adapters.has(capability.containerKind)) {
      console.warn(
        `[insertable-registry] Capability for kind "${capability.containerKind}" already registered. Keeping the first; second call ignored.`,
      );
      return () => undefined;
    }
    adapters.set(capability.containerKind, capability as unknown as InsertableCapability);
    return () => {
      adapters.delete(capability.containerKind);
    };
  }

  return {
    register,
    get: <K extends ContainerKind>(kind: K) =>
      adapters.get(kind) as InsertableCapability<K> | undefined,
    list: () => Array.from(adapters.values()),
  };
}
