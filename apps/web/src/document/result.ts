// WI-249 / DR-165 — declarative typed-error channel (Effect-ts `E`-channel idea,
// no runtime).
//
// `Result<A, E>` carries a success value OR a TYPED error in the type, so the
// compiler tracks which errors a producer can yield and `match` forces every
// variant to be handled (declarative error checking). `WeaveError` is a tagged
// union; each variant keeps a stable `code` string for back-compat with the
// existing stringly command error codes (tests / agent surface). Optional
// `cause` + `trace` give a lightweight logical call-path across sync/async
// boundaries (the (B) traceability idea) without a fiber runtime.

export type WeaveError =
  | {
      readonly _tag: "NotFound";
      readonly code: "item-not-found";
      readonly message: string;
      readonly itemId?: string;
      readonly cause?: WeaveError;
      readonly trace?: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "Invalid";
      readonly code: "invalid-input";
      readonly message: string;
      readonly field?: string;
      readonly cause?: WeaveError;
      readonly trace?: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "NotApplicable";
      readonly code: "not-applicable";
      readonly message: string;
      readonly kind?: string;
      readonly itemId?: string;
      readonly cause?: WeaveError;
      readonly trace?: ReadonlyArray<string>;
    }
  // Bridge for the many legacy command codes not yet modeled as their own tag.
  | {
      readonly _tag: "Other";
      readonly code: string;
      readonly message: string;
      readonly cause?: WeaveError;
      readonly trace?: ReadonlyArray<string>;
    };

export type Result<A, E = WeaveError> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: E };

/** Async edges (fetch / persist / model call) share the SAME error channel, so a
 *  boundary handles one error union regardless of sync/async origin. */
export type AsyncResult<A, E = WeaveError> = Promise<Result<A, E>>;

export const ok = <A, E = WeaveError>(value: A): Result<A, E> => ({ ok: true, value });
export const err = <A = never, E = WeaveError>(error: E): Result<A, E> => ({ ok: false, error });

export const isOk = <A, E>(r: Result<A, E>): r is { ok: true; value: A } => r.ok;

// ── typed WeaveError constructors ──
export const notFound = (itemId: string, message = `no item with id "${itemId}"`): WeaveError => ({
  _tag: "NotFound",
  code: "item-not-found",
  message,
  itemId,
});
export const invalid = (message: string, field?: string): WeaveError => ({
  _tag: "Invalid",
  code: "invalid-input",
  message,
  ...(field !== undefined ? { field } : {}),
});
export const notApplicable = (message: string, kind?: string, itemId?: string): WeaveError => ({
  _tag: "NotApplicable",
  code: "not-applicable",
  message,
  ...(kind !== undefined ? { kind } : {}),
  ...(itemId !== undefined ? { itemId } : {}),
});
export const otherError = (code: string, message: string): WeaveError => ({
  _tag: "Other",
  code,
  message,
});

/** Declarative, EXHAUSTIVE error handling — the compiler errors if a `_tag` is
 *  unhandled (no `default` fallthrough; that is the point). */
export function matchError<R>(
  error: WeaveError,
  handlers: {
    NotFound: (e: Extract<WeaveError, { _tag: "NotFound" }>) => R;
    Invalid: (e: Extract<WeaveError, { _tag: "Invalid" }>) => R;
    NotApplicable: (e: Extract<WeaveError, { _tag: "NotApplicable" }>) => R;
    Other: (e: Extract<WeaveError, { _tag: "Other" }>) => R;
  },
): R {
  switch (error._tag) {
    case "NotFound":
      return handlers.NotFound(error);
    case "Invalid":
      return handlers.Invalid(error);
    case "NotApplicable":
      return handlers.NotApplicable(error);
    case "Other":
      return handlers.Other(error);
  }
}

/** Append a logical op to an error's trace (the (B) cross-sync/async breadcrumb).
 *  Keeps the original error as `cause` so the chain is inspectable. */
export function withTrace<E extends WeaveError>(op: string, error: E): WeaveError {
  return { ...error, trace: [op, ...(error.trace ?? [])] };
}
