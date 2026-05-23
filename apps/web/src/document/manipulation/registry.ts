import type { ManipulationCapability, ManipulationRegistry, SelectableTarget } from "./types.js";

export function createManipulationRegistry(): ManipulationRegistry {
  const adapters = new Map<string, ManipulationCapability>();

  function register<K extends string, T extends SelectableTarget<K>>(
    capability: ManipulationCapability<K, T>,
  ): () => void {
    if (adapters.has(capability.targetKind)) {
      console.warn(
        `[manipulation-registry] Capability for kind "${capability.targetKind}" already registered. Keeping the first; second call ignored.`,
      );
      return () => undefined;
    }
    adapters.set(capability.targetKind, capability as unknown as ManipulationCapability);
    return () => {
      adapters.delete(capability.targetKind);
    };
  }

  return {
    register,
    get: (kind) => adapters.get(kind),
    list: () => Array.from(adapters.values()),
  };
}
