// DR-010 — Manipulation Capability Registry types.

export type HandleDir = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export interface SelectableTarget<K extends string = string> {
  readonly kind: K;
  /** Unique within its parent Item (e.g., canvas shape id). For block-level
   *  targets this equals the Item id. */
  readonly id: string;
  /** Top-level Item id the target lives in. Block-level targets repeat their id. */
  readonly itemId: string;
}

export interface BoundingBox {
  /** Top-left, in viewport-local coordinates. Units are domain-specific (canvas
   *  uses percent of viewport, doc may use px). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Radians, around the box center. */
  readonly rotation: number;
}

export interface ManipulationCapability<
  K extends string = string,
  T extends SelectableTarget<K> = SelectableTarget<K>,
> {
  readonly targetKind: K;
  readonly selectable: boolean;
  readonly move?: {
    readonly axis: "free" | "vertical" | "horizontal";
    /** Delta is in the same units as BoundingBox. Adapter mutates state via
     *  closures captured at register time (e.g., useDocument.updateItem). */
    readonly apply: (target: T, delta: { readonly dx: number; readonly dy: number }) => void;
  };
  readonly resize?: {
    readonly kind:
      | "free"
      | "aspect-preserved"
      | "width-only"
      | "height-only"
      | "font-only"
      | "lines-count";
    readonly handles: ReadonlyArray<HandleDir>;
    readonly apply: (
      target: T,
      delta: { readonly dw: number; readonly dh: number; readonly dir: HandleDir },
    ) => void;
  };
  readonly rotate?: {
    readonly apply: (target: T, deltaRadians: number) => void;
  };
  readonly getBoundingBox: (target: T) => BoundingBox;
  readonly destroy?: (target: T) => void;
}

export interface ManipulationRegistry {
  readonly register: <K extends string, T extends SelectableTarget<K>>(
    capability: ManipulationCapability<K, T>,
  ) => () => void;
  readonly get: (kind: string) => ManipulationCapability | undefined;
  readonly list: () => ReadonlyArray<ManipulationCapability>;
}
