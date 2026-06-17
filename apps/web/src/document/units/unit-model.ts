// WI-247 / DR-163 — Unit model contract.
//
// A "unit model" makes each unit the EXPERT on its own state (GRASP Information
// Expert): it owns reading, value VALIDATION, an APPLICABILITY rule (does the
// unit meaningfully apply to a given item — e.g. flip excludes text/qr), the
// canonical attrs projection, and its own MANIPULATION operations (pure
// transforms of its state — crop: pan/resize/straighten; flip: toggle). A unit
// does NOT expose a raw "set arbitrary attrs" setter — callers construct or
// transform state only through validated operations.
//
// Commands become ORCHESTRATORS: find the item → consult the unit model
// (appliesTo / validate / manipulate) → emit the patch (via the shared
// setDecoration kit). The per-unit differences (flip's kind rule, crop's range
// validation) live in the unit model, not inline in the command.

import type { Item as AgocraftItem } from "@agocraft/core";
import { err, invalid, ok, otherError, type Result, type WeaveError } from "../result.js";

// WI-249 / DR-165 — a unit's validation error is the shared typed `WeaveError`
// channel (one error type across the unit + effect + command layers, matchable),
// not a parallel `{code,message}` shape. `code` is preserved (each WeaveError
// variant carries it) so the command `fail(error.code, …)` surface is unchanged.
export type UnitResult<A> = Result<A, WeaveError>;

export const unitOk = ok;
/** All current unit validations use `invalid-input`; the bridge keeps any other
 *  code as `Other` (still typed) so the helper stays generic. */
export const unitErr = <A>(code: string, message: string): UnitResult<A> =>
  err(code === "invalid-input" ? invalid(message) : otherError(code, message));

/** The common contract every unit model satisfies. `A` is the unit's validated
 *  state type; per-unit MANIPULATION operations are added on the concrete model
 *  (they differ per unit, so they are not part of this base interface). */
export interface UnitModel<A> {
  /** The unit kind string (e.g. "crop.window", "transform.flip"). */
  readonly kind: string;
  /** Current state on the item (or the unit's identity when absent). */
  read(item: AgocraftItem): A;
  /** Validate a candidate value → canonical state, or a coded error. */
  validate(candidate: unknown): UnitResult<A>;
  /** Whether the unit meaningfully applies to this item. Default models return
   *  `true` (kind-agnostic); a unit with an editorial/technical restriction
   *  (flip → no text/qr) encodes it HERE so the command never inlines a kind
   *  gate. */
  appliesTo(item: AgocraftItem): boolean;
  /** The attrs to persist for a state — `null` clears the unit. The command
   *  feeds this straight to the setDecoration kit; it is the only write path. */
  toAttrs(value: A): Readonly<Record<string, unknown>> | null;
}
