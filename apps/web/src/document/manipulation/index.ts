// WI-032 Phase 3b — `canvas-shape` capability + `agocraft-bridge` were
// removed with the legacy `canvas-design` kind. The DR-010 registry
// shape stays so future capabilities (frame manipulation, primitive
// shape attrs) can plug in here without re-deriving the contract.
export { createManipulationRegistry } from "./registry.js";
export type {
  BoundingBox,
  HandleDir,
  ManipulationCapability,
  ManipulationRegistry,
  SelectableTarget,
} from "./types.js";
